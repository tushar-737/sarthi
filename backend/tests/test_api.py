"""End-to-end API tests, including the reliability rules the demo depends on."""

from __future__ import annotations

import pytest


def test_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["demo_mode"] is True  # tests run without an API key
    assert body["knowledge_base"]["services"] >= 6


def test_api_index_lists_endpoints(client):
    body = client.get("/api").json()
    assert "POST /api/chat" in body["endpoints"].values()
    assert body["notice"]


def test_security_headers_present(client):
    headers = client.get("/api/health").headers
    assert headers["x-content-type-options"] == "nosniff"
    assert headers["referrer-policy"] == "no-referrer"


# --- Services ---------------------------------------------------------------


def test_list_services(client):
    body = client.get("/api/services?language=en").json()
    assert body["total"] >= 6
    assert all(s["name"] for s in body["services"])


def test_service_detail_is_bilingual(client):
    hindi = client.get("/api/services/income_certificate?language=hi").json()
    english = client.get("/api/services/income_certificate?language=en").json()
    assert hindi["name"] == "आय प्रमाण पत्र"
    assert english["name"] == "Income Certificate"
    assert hindi["documents"] and hindi["steps"] and hindi["eligibility"]
    assert hindi["source"]["last_verified"]


def test_service_detail_exposes_verification(client):
    body = client.get("/api/services/national_scholarship?language=en").json()
    assert body["verification_level"] == "verified_official"
    assert body["source"]["url"].startswith("https://")
    assert body["verification_note"]


def test_unknown_service_returns_friendly_404(client):
    response = client.get("/api/services/does_not_exist")
    assert response.status_code == 404
    body = response.json()
    assert body["error"]["code"] == "service_not_found"
    assert "verified knowledge base" in body["error"]["message"]
    assert "Traceback" not in response.text


def test_search_finds_services(client):
    body = client.post(
        "/api/service/search", json={"query": "आय प्रमाण पत्र", "limit": 3}
    ).json()
    assert body["matches"][0]["service"]["id"] == "income_certificate"
    assert body["detected_language"] == "hi"


# --- Categories & languages ------------------------------------------------


def test_categories(client):
    body = client.get("/api/categories?language=en").json()
    ids = {c["id"] for c in body}
    assert {"certificates", "education", "health"} <= ids
    assert all(c["service_count"] >= 1 for c in body)


def test_category_detail(client):
    body = client.get("/api/categories/certificates?language=hi").json()
    assert body["name"] == "प्रमाण पत्र"
    assert len(body["services"]) == 3


def test_languages_mark_planned_ones(client):
    body = client.get("/api/languages").json()
    available = [lang for lang in body if lang["status"] == "available"]
    planned = [lang for lang in body if lang["status"] == "planned"]
    assert {lang["code"] for lang in available} == {"hi", "en"}
    assert len(planned) >= 5, "the architecture must show how languages are added"
    assert all(lang["speech_locale"] for lang in available)


# --- Chat ------------------------------------------------------------------


def test_chat_hindi_demo_scenario(client):
    body = client.post(
        "/api/chat",
        json={"message": "मुझे आय प्रमाण पत्र बनवाना है।", "language": "hi", "input_mode": "voice"},
    ).json()
    assert body["intent"]["intent_type"] == "service_query"
    assert body["intent"]["service_id"] == "income_certificate"
    types = [block["type"] for block in body["reply"]["blocks"]]
    for expected in ("service_card", "documents", "steps", "source", "journey_cta"):
        assert expected in types
    assert body["sources"][0]["url"]
    assert body["disclaimer"]
    assert body["demo_mode"] is True


def test_chat_answers_in_the_language_used_not_the_setting(client):
    """UI set to Hindi, citizen types English → answer in English."""
    body = client.post(
        "/api/chat", json={"message": "how do I get a voter id card", "language": "hi"}
    ).json()
    assert body["reply"]["language"] == "en"


def test_chat_clarifies_when_confused(client):
    body = client.post(
        "/api/chat", json={"message": "मुझे समझ नहीं आ रहा कि मुझे कौन सा certificate चाहिए।"}
    ).json()
    assert body["clarification"]["needed"] is True
    assert len(body["clarification"]["options"]) >= 4
    assert body["intent"]["service_id"] is None


def test_chat_refuses_out_of_scope(client):
    body = client.post("/api/chat", json={"message": "what is the weather today"}).json()
    assert body["intent"]["service_id"] is None
    assert "could not verify" in body["reply"]["text"].lower()


def test_chat_empty_input_gives_a_human_message(client):
    body = client.post("/api/chat", json={"message": "   "}).json()
    assert body["error"] == "empty_input"
    assert body["reply"]["text"]
    assert body["reply"]["blocks"]


def test_chat_too_long_is_handled_gracefully(client):
    body = client.post("/api/chat", json={"message": "a" * 2000}).json()
    assert body["error"] == "too_long"


def test_chat_quick_reply_resolves_a_service(client):
    body = client.post(
        "/api/chat",
        json={
            "message": "छात्रवृत्ति या पढ़ाई",
            "clarifier_answer": "national_scholarship",
            "input_mode": "quick_reply",
        },
    ).json()
    assert body["intent"]["service_id"] == "national_scholarship"
    assert body["intent"]["confidence"] > 0.9


def test_chat_followup_stays_on_the_service(client):
    body = client.post(
        "/api/chat",
        json={
            "message": "कौन से दस्तावेज़ चाहिए",
            "language": "hi",
            "active_service_id": "income_certificate",
        },
    ).json()
    assert body["intent"]["intent_type"] == "followup"
    assert body["intent"]["service_id"] == "income_certificate"
    types = [block["type"] for block in body["reply"]["blocks"]]
    assert "documents" in types


def test_chat_conversation_id_is_stable_when_supplied(client):
    first = client.post("/api/chat", json={"message": "नमस्ते", "conversation_id": "conv_test"}).json()
    assert first["conversation_id"] == "conv_test"
    second = client.post("/api/chat", json={"message": "नमस्ते"}).json()
    assert second["conversation_id"].startswith("conv_")


def test_chat_never_echoes_a_secret(client):
    body = client.post(
        "/api/chat", json={"message": "my aadhaar is 1234 5678 9012 how do I get income certificate"}
    ).json()
    assert "1234 5678 9012" not in body["reply"]["text"]


def test_chat_validation_error_is_friendly(client):
    response = client.post("/api/chat", json={"message": ["not", "a", "string"]})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_request"
    assert "Traceback" not in response.text


# --- Voice -----------------------------------------------------------------


def test_voice_support_reports_capabilities(client):
    body = client.get("/api/voice/support").json()
    assert body["recommended_mode"] == "browser"
    assert "hi-IN" in body["supported_locales"]
    assert "optional" in body["notice"].lower()


def test_voice_process_returns_transcript_for_confirmation(client):
    body = client.post(
        "/api/voice/process", json={"transcript": "मुझे जाति प्रमाण पत्र बनवाना है", "language": "hi"}
    ).json()
    assert body["needs_confirmation"] is True
    assert body["chat"] is None
    assert body["transcription"]["ok"] is True


def test_voice_process_auto_submit_answers(client):
    body = client.post(
        "/api/voice/process",
        json={
            "transcript": "मुझे जाति प्रमाण पत्र बनवाना है",
            "language": "hi",
            "auto_submit": True,
        },
    ).json()
    assert body["chat"]["intent"]["service_id"] == "caste_certificate"


def test_voice_empty_transcript_is_friendly(client):
    response = client.post("/api/voice/process", json={"transcript": "   "})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "empty_transcript"


def test_voice_transcribe_degrades_without_a_key(client):
    """No API key → clear explanation, not a 500."""
    response = client.post(
        "/api/voice/transcribe",
        files={"file": ("audio.webm", b"fake-bytes", "audio/webm")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is False
    assert body["error_code"] == "transcription_unavailable"
    assert "type your question" in body["message"].lower()


def test_voice_transcribe_rejects_bad_content_type(client):
    response = client.post(
        "/api/voice/transcribe",
        files={"file": ("note.txt", b"not audio", "text/plain")},
    )
    assert response.status_code == 415


# --- Navigator -------------------------------------------------------------


def test_journey_shape(client):
    body = client.get("/api/services/income_certificate/journey?language=en").json()
    kinds = [step["kind"] for step in body["steps"]]
    assert kinds[0] == "eligibility"
    assert kinds[1] == "documents"
    assert "portal" in kinds
    assert body["steps"][0]["checklist"], "eligibility step carries the criteria"
    assert body["steps"][1]["checklist"], "documents step carries the checklist"
    assert any(step["action_url"] for step in body["steps"])


def test_journey_has_no_duplicate_tracking_step(client):
    body = client.get("/api/services/income_certificate/journey?language=en").json()
    titles = [step["title"].lower() for step in body["steps"]]
    assert sum("track" in title for title in titles) <= 1


def test_journey_progress_roundtrip(client):
    saved = client.post(
        "/api/services/income_certificate/journey/progress",
        json={
            "service_id": "income_certificate",
            "completed_steps": ["check_eligibility", "prepare_documents"],
            "current_step": 3,
            "language": "en",
        },
    ).json()
    assert saved["percent_complete"] > 0
    assert saved["current_step"] == 3
    assert saved["completed_steps"] == ["check_eligibility", "prepare_documents"]


def test_journey_progress_rejects_unknown_step_ids(client):
    saved = client.post(
        "/api/services/income_certificate/journey/progress",
        json={"service_id": "income_certificate", "completed_steps": ["made_up_step"]},
    ).json()
    assert saved["completed_steps"] == []


def test_journey_progress_clamps_out_of_range(client):
    saved = client.post(
        "/api/services/income_certificate/journey/progress",
        json={"service_id": "income_certificate", "current_step": 999},
    ).json()
    assert saved["current_step"] == saved["total_steps"]


def test_journey_progress_mismatched_service(client):
    response = client.post(
        "/api/services/income_certificate/journey/progress",
        json={"service_id": "pan_card"},
    )
    assert response.status_code == 400


def test_journey_unknown_service(client):
    assert client.get("/api/services/nope/journey").status_code == 404


# --- Meta ------------------------------------------------------------------


def test_meta_config(client):
    body = client.get("/api/meta/config?language=hi").json()
    assert body["app_name"] == "SAARTHI AI"
    assert body["demo_mode"] is True
    assert body["disclaimer"]
    assert body["privacy_notice"]


def test_meta_phrases_are_localised(client):
    body = client.get("/api/meta/phrases?language=hi").json()
    assert body["visit_portal"] == "आधिकारिक पोर्टल पर जाएँ"
    english = client.get("/api/meta/phrases?language=en").json()
    assert english["visit_portal"] == "Visit Official Portal"


def test_suggested_prompts_are_localised(client):
    body = client.post("/api/chat", json={"message": "नमस्ते", "language": "hi"}).json()
    assert body["suggested_prompts"]
    assert all(p["text"] for p in body["suggested_prompts"])


def test_quick_actions_present_for_a_service(client):
    body = client.post(
        "/api/chat", json={"message": "मुझे आय प्रमाण पत्र बनवाना है।"}
    ).json()
    ids = {action["id"] for action in body["quick_actions"]}
    assert {"documents", "eligibility", "steps", "journey"} <= ids
    journey_action = next(a for a in body["quick_actions"] if a["id"] == "journey")
    assert journey_action["value"].startswith("/navigator/")


def test_unsupported_language_is_explained(client):
    body = client.post("/api/chat", json={"message": "আমার আয়ের প্রমাণপত্র দরকার"}).json()
    assert body["intent"]["intent_type"] == "unsupported_language"
    assert body["reply"]["text"]


@pytest.mark.parametrize(
    "service_id",
    [
        "income_certificate", "caste_certificate", "domicile_certificate",
        "aadhaar_enrolment", "pan_card", "voter_id", "national_scholarship",
        "job_registration", "mgnrega_job_card", "ayushman_card",
        "old_age_pension", "pm_awas_urban", "driving_licence",
    ],
)
def test_every_service_is_fully_renderable(client, service_id):
    """No page may be a placeholder — every service must render completely."""
    for language in ("hi", "en"):
        body = client.get(f"/api/services/{service_id}?language={language}").json()
        assert body["description"], f"{service_id}/{language} description"
        assert body["eligibility"], f"{service_id}/{language} eligibility"
        assert body["documents"], f"{service_id}/{language} documents"
        assert body["steps"], f"{service_id}/{language} steps"
        assert body["official_source"], f"{service_id}/{language} source"
        assert body["source"]["last_verified"], f"{service_id}/{language} verified date"
        journey = client.get(f"/api/services/{service_id}/journey?language={language}").json()
        assert journey["total_steps"] >= 4
