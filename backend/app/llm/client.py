import hashlib
import json
import re
import time

import httpx
from anthropic import Anthropic, APIError

from app.config import settings
from app.llm.prompts import MAX_BUTTONS, build_system_prompt
from app.llm.schemas import BlocItem, ChatResponse, HistoryMessage, QAItem, TarifM2Item

# Modèle par défaut
MODEL = "claude-opus-4-8"
# Derniers tours de conversation conservés pour le contexte.
MAX_HISTORY = 10
# Longueur maximale d'un libellé de bouton (sécurité d'affichage).
MAX_BUTTON_LEN = 48
# Échec rapide : le front bascule sur le matching local
TIMEOUT_SECONDS = 30.0
MAX_RETRIES = 1
# Cache des réponses du chat
CACHE_TTL_SECONDS = 600.0
CACHE_MAX_ENTRIES = 256

# Schéma de sortie structuré : garantit la forme { answer, buttons } renvoyée par le modèle.
_REPLY_SCHEMA = {
    "type": "object",
    "properties": {
        "answer": {"type": "string"},
        "buttons": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["answer", "buttons"],
    "additionalProperties": False,
}


# L'IA ne peut pas répondre (clé absente ou erreur API).
class LLMUnavailable(RuntimeError):
    pass


# Client partagé entre requêtes (réutilise le pool de connexions HTTP).
_cached_client: Anthropic | None = None
_cached_key: str | None = None


def _client() -> Anthropic:
    global _cached_client, _cached_key
    if not settings.anthropic_api_key:
        raise LLMUnavailable("ANTHROPIC_API_KEY non configurée")
    if _cached_client is None or _cached_key != settings.anthropic_api_key:
        _cached_client = Anthropic(
            api_key=settings.anthropic_api_key,
            timeout=TIMEOUT_SECONDS,
            max_retries=MAX_RETRIES,
        )
        _cached_key = settings.anthropic_api_key
    return _cached_client


# Construit les messages API ; limit=None garde tout l'historique.
def _conversation(
    history: list[HistoryMessage], message: str, *, limit: int | None = MAX_HISTORY
) -> list[dict]:
    kept = history if limit is None else history[-limit:]
    messages = [{"role": m.role, "content": m.content} for m in kept]
    messages.append({"role": "user", "content": message})
    return messages


# Appel LLM à sortie JSON structurée.
def _structured_call(
    *,
    system: str,
    messages: list[dict],
    schema: dict,
    effort: str | None = None,
) -> dict:
    if settings.llm_provider == "gemini":
        return _gemini_call(system=system, messages=messages, schema=schema)
    if settings.llm_provider == "mistral":
        return _mistral_call(system=system, messages=messages, schema=schema)
    if settings.llm_provider == "ollama":
        return _ollama_call(system=system, messages=messages, schema=schema)

    client = _client()
    output_config: dict = {"format": {"type": "json_schema", "schema": schema}}
    if effort:
        output_config["effort"] = effort

    try:
        response = client.messages.create(
            model=MODEL,
            max_tokens=1024,
            system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
            messages=messages,
            output_config=output_config,
        )
    except APIError as exc:
        raise LLMUnavailable(str(exc)) from exc

    text = next((b.text for b in response.content if b.type == "text"), "")
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise LLMUnavailable("Réponse LLM illisible") from exc


GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


# Même contrat que l'appel Anthropic, via l'API REST Gemini (sortie JSON par schéma).
def _gemini_call(*, system: str, messages: list[dict], schema: dict) -> dict:
    if not settings.gemini_api_key:
        raise LLMUnavailable("GEMINI_API_KEY non configurée")

    body = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [
            {
                "role": "model" if m["role"] == "assistant" else "user",
                "parts": [{"text": m["content"]}],
            }
            for m in messages
        ],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseJsonSchema": schema,
            "maxOutputTokens": 2048,
        },
    }
    try:
        resp = httpx.post(
            GEMINI_URL.format(model=settings.gemini_model),
            headers={"x-goog-api-key": settings.gemini_api_key},
            json=body,
            timeout=TIMEOUT_SECONDS,
        )
        resp.raise_for_status()
        parts = resp.json()["candidates"][0]["content"]["parts"]
    except httpx.HTTPStatusError as exc:
        raise LLMUnavailable(f"Gemini HTTP {exc.response.status_code}") from exc
    except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
        raise LLMUnavailable("Gemini indisponible") from exc

    text = "".join(p.get("text", "") for p in parts if not p.get("thought"))
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise LLMUnavailable("Réponse LLM illisible") from exc


MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions"


# Même contrat via l'API Mistral (format OpenAI, sortie JSON stricte par schéma).
def _mistral_call(*, system: str, messages: list[dict], schema: dict) -> dict:
    if not settings.mistral_api_key:
        raise LLMUnavailable("MISTRAL_API_KEY non configurée")

    body = {
        "model": settings.mistral_model,
        "messages": [{"role": "system", "content": system}, *messages],
        "response_format": {
            "type": "json_schema",
            "json_schema": {"name": "reponse", "schema": schema, "strict": True},
        },
        "max_tokens": 2048,
    }
    try:
        resp = httpx.post(
            MISTRAL_URL,
            headers={"Authorization": f"Bearer {settings.mistral_api_key}"},
            json=body,
            timeout=TIMEOUT_SECONDS,
        )
        resp.raise_for_status()
        text = resp.json()["choices"][0]["message"]["content"]
    except httpx.HTTPStatusError as exc:
        raise LLMUnavailable(f"Mistral HTTP {exc.response.status_code}") from exc
    except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
        raise LLMUnavailable("Mistral indisponible") from exc

    try:
        return json.loads(text)
    except (json.JSONDecodeError, TypeError) as exc:
        raise LLMUnavailable("Réponse LLM illisible") from exc


# Modèle local plus lent qu'une API : délai plus large (le 1er appel charge le modèle).
OLLAMA_TIMEOUT_SECONDS = 120.0


# Même contrat via Ollama en local (gratuit, sans clé) ; `format` impose le schéma JSON.
def _ollama_call(*, system: str, messages: list[dict], schema: dict) -> dict:
    body = {
        "model": settings.ollama_model,
        "messages": [{"role": "system", "content": system}, *messages],
        "format": schema,
        "stream": False,
        # Garde le modèle en mémoire : évite le rechargement (plusieurs secondes) à chaque requête.
        "keep_alive": "1h",
        "options": {"num_predict": 2048},
    }
    try:
        resp = httpx.post(
            f"{settings.ollama_url.rstrip('/')}/api/chat",
            json=body,
            timeout=OLLAMA_TIMEOUT_SECONDS,
        )
        resp.raise_for_status()
        text = resp.json()["message"]["content"]
    except httpx.HTTPStatusError as exc:
        raise LLMUnavailable(f"Ollama HTTP {exc.response.status_code}") from exc
    except httpx.ConnectError as exc:
        raise LLMUnavailable("Ollama injoignable (lancé sur la machine ?)") from exc
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        raise LLMUnavailable("Ollama indisponible") from exc

    try:
        return json.loads(text)
    except (json.JSONDecodeError, TypeError) as exc:
        raise LLMUnavailable("Réponse LLM illisible") from exc


# ─── Cache TTL en mémoire (process-local) ─────────────────────────────────────

_reply_cache: dict[str, tuple[float, ChatResponse]] = {}


def _cache_key(system: str, messages: list[dict]) -> str:
    raw = json.dumps({"system": system, "messages": messages}, ensure_ascii=False)
    return hashlib.sha256(raw.encode()).hexdigest()


def _cache_get(key: str) -> ChatResponse | None:
    entry = _reply_cache.get(key)
    if entry is None:
        return None
    expires_at, value = entry
    if time.monotonic() > expires_at:
        _reply_cache.pop(key, None)
        return None
    return value


def _cache_put(key: str, value: ChatResponse) -> None:
    # Éviction simple : on écarte l'entrée la plus ancienne une fois plein.
    if len(_reply_cache) >= CACHE_MAX_ENTRIES:
        oldest = min(_reply_cache, key=lambda k: _reply_cache[k][0])
        _reply_cache.pop(oldest, None)
    _reply_cache[key] = (time.monotonic() + CACHE_TTL_SECONDS, value)


def clear_reply_cache() -> None:
    _reply_cache.clear()


# Nettoie les boutons : retire les vides, déduplique, tronque, limite le nombre.
def clean_buttons(buttons: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for raw in buttons:
        label = (raw or "").strip()
        key = label.lower()
        if label and key not in seen:
            seen.add(key)
            out.append(label[:MAX_BUTTON_LEN])
        if len(out) >= MAX_BUTTONS:
            break
    return out


# Demande de coordonnées : pas de boutons de suggestion
_ASKS_CONTACT = re.compile(r"coordonn|e-?mail|t[ée]l[ée]phone|pr[ée]nom|votre nom", re.IGNORECASE)
_PERSONAL_DATA = re.compile(r"@|\d[\d .()+-]{5,}")


# Retire de la réponse les libellés de boutons recopiés par le modèle (sinon affichés deux fois).
def strip_button_labels(answer: str, buttons: list[str]) -> str:
    text = re.sub(r"<br\s*/?>", "\n", answer, flags=re.IGNORECASE)
    for label in buttons:
        lab = re.escape(label)
        # En gras n'importe où, ou seul sur sa ligne ; jamais au milieu d'une phrase.
        text = re.sub(r"\*\*\s*" + lab + r"\s*\*\*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"^[ \t]*[-•]?[ \t]*" + lab + r"[ \t]*$", "", text, flags=re.IGNORECASE | re.MULTILINE)
    # Nettoie les connecteurs orphelins (« ou », « / », « - ») laissés en fin de ligne.
    text = re.sub(r"[ \t]*(?:\b(?:ou|et)\b|[/|•-])(?:[ \t]*(?:\b(?:ou|et)\b|[/|•-]))*[ \t]*$", "", text, flags=re.MULTILINE | re.IGNORECASE)
    text = re.sub(r"[ \t]+\n", "\n", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def filter_buttons(answer: str, buttons: list[str]) -> list[str]:
    if _ASKS_CONTACT.search(answer):
        return []
    return [b for b in buttons if not _PERSONAL_DATA.search(b)]


# Interroge le LLM et renvoie une réponse précise ancrée sur la base de connaissances.
def generate_reply(
    *,
    message: str,
    company_name: str,
    qas: list[QAItem],
    blocs: list[BlocItem],
    history: list[HistoryMessage],
    prix_m2: str | None,
    tarifs_m2: list[TarifM2Item] | None = None,
) -> ChatResponse:
    system = build_system_prompt(company_name, qas, blocs, prix_m2, tarifs_m2)
    messages = _conversation(history, message)

    key = _cache_key(system, messages)
    cached = _cache_get(key)
    if cached is not None:
        # Copie défensive : l'entrée en cache ne doit pas être mutable par l'appelant.
        return cached.model_copy(deep=True)

    data = _structured_call(
        system=system,
        messages=messages,
        schema=_REPLY_SCHEMA,
        # Effort réduit : réponses ancrées sur une base fournie, la latence prime.
        effort="medium",
    )

    buttons = clean_buttons(data.get("buttons", []))
    answer = strip_button_labels(str(data.get("answer", "")).strip(), buttons)
    if not answer:
        # Réponse vide inaffichable : le front bascule sur le matching local.
        raise LLMUnavailable("Réponse LLM vide")

    response = ChatResponse(answer=answer, buttons=filter_buttons(answer, buttons))
    # Copie à l'écriture aussi : l'appelant ne doit pas pouvoir muter l'entrée.
    _cache_put(key, response.model_copy(deep=True))
    return response
