"""Intent understanding and language detection.

These tests encode the three hackathon demo scenarios plus the cases where
SAARTHI must refuse to guess.
"""

from __future__ import annotations

import pytest


# --- Scenario 1: Hindi voice → Income Certificate ---------------------------


@pytest.mark.parametrize(
    "query,expected",
    [
        ("मुझे आय प्रमाण पत्र बनवाना है।", "income_certificate"),
        ("मुझे आय प्रमाण पत्र बनवाना है", "income_certificate"),
        ("I want to apply for an income certificate.", "income_certificate"),
        ("income certificate kaise banwaye", "income_certificate"),
        ("आय प्रमाण पत्र के लिए क्या करना होगा", "income_certificate"),
    ],
)
def test_scenario_1_income_certificate(analyzer, query, expected):
    analysis = analyzer.analyze(query)
    assert analysis.service_id == expected
    assert analysis.intent_type == "service_query"
    assert analysis.confidence >= 0.7


def test_scenario_1_detects_hindi(analyzer):
    analysis = analyzer.analyze("मुझे आय प्रमाण पत्र बनवाना है।")
    assert analysis.language == "hi"


# --- Scenario 2: English → Scholarship -------------------------------------


@pytest.mark.parametrize(
    "query",
    [
        "I need financial help for my college education.",
        "मुझे पढ़ाई के लिए सरकारी मदद चाहिए।",
        "मेरे परिवार की income कम है और मुझे पढ़ाई के लिए मदद चाहिए।",
        "how do I apply for a scholarship",
        "scholarship ke liye kya karna hoga",
    ],
)
def test_scenario_2_scholarship(analyzer, query):
    analysis = analyzer.analyze(query)
    assert analysis.service_id == "national_scholarship"
    assert analysis.category_id == "education"


def test_scenario_2_extracts_study_level(analyzer):
    analysis = analyzer.analyze("I need financial help for my college education.")
    assert analysis.entities.study_level == "college"
    assert analysis.entities.purpose == "scholarship"


# --- Scenario 3: Confused citizen → clarifying question ---------------------


@pytest.mark.parametrize(
    "query",
    [
        "मुझे समझ नहीं आ रहा कि मुझे कौन सा certificate चाहिए।",
        "I don't know which certificate I need",
        "मुझे नहीं पता कौन सा प्रमाण पत्र लगेगा",
    ],
)
def test_scenario_3_asks_instead_of_guessing(analyzer, query):
    analysis = analyzer.analyze(query)
    assert analysis.needs_clarification is True
    assert analysis.intent_type in {"clarify", "service_query"}
    if analysis.intent_type == "clarify":
        assert analysis.service_id is None


def test_scenario_3_confusion_detected(analyzer):
    analysis = analyzer.analyze("मुझे समझ नहीं आ रहा कि मुझे कौन सा certificate चाहिए।")
    assert analysis.entities.is_confused is True


# --- Language detection -----------------------------------------------------


@pytest.mark.parametrize(
    "query,expected",
    [
        ("मुझे पेंशन चाहिए", "hi"),
        ("pension kaise milta hai", "hi"),
        ("income certificate kaise banwaye", "hi"),
        ("I want to apply for an income certificate.", "en"),
        ("my mother is a widow can she get pension", "en"),
        ("how do I get a scholarship", "en"),
    ],
)
def test_language_detection(query, expected):
    from app.knowledge.language import detect_language

    assert detect_language(query) == expected


def test_english_words_do_not_look_hinglish():
    """'pension'/'income'/'certificate' are English too — must not flip language."""
    from app.knowledge.language import detect_language

    assert detect_language("pension and income certificate for my father") == "en"


def test_unsupported_script_is_reported(analyzer):
    analysis = analyzer.analyze("আমার আয়ের প্রমাণপত্র দরকার")  # Bengali
    assert analysis.intent_type == "unsupported_language"
    assert analysis.unsupported_language == "bn"


# --- Refusing to guess -----------------------------------------------------


@pytest.mark.parametrize(
    "query",
    [
        "what is the weather today",
        "who won the cricket match",
        "best restaurant near me",
        "write me a poem about rain",
    ],
)
def test_out_of_scope_is_not_answered_as_a_service(analyzer, query):
    analysis = analyzer.analyze(query)
    assert analysis.service_id is None
    assert analysis.intent_type == "out_of_scope"
    assert analysis.confidence < 0.35


def test_greeting_is_recognised(analyzer):
    analysis = analyzer.analyze("नमस्ते")
    assert analysis.intent_type == "greeting"


def test_browse_request(analyzer):
    analysis = analyzer.analyze("what services can you help with")
    assert analysis.intent_type == "browse"


# --- Entities --------------------------------------------------------------


def test_age_extraction(analyzer):
    analysis = analyzer.analyze("my father is 65 years old can he get pension")
    assert analysis.entities.age == 65
    assert analysis.entities.relation == "father"
    assert analysis.service_id == "old_age_pension"


def test_state_extraction(analyzer):
    analysis = analyzer.analyze("मुझे उत्तर प्रदेश में आय प्रमाण पत्र चाहिए")
    assert analysis.entities.state == "up"


def test_widow_pension_entities(analyzer):
    analysis = analyzer.analyze("my mother is a widow, can she get a pension")
    assert analysis.entities.pension_type == "widow"


# --- Follow-ups ------------------------------------------------------------


def test_followup_on_active_service(analyzer):
    context = {"active_service_id": "income_certificate"}
    analysis = analyzer.analyze("कौन से दस्तावेज़ चाहिए", context=context)
    assert analysis.intent_type == "followup"
    assert analysis.service_id == "income_certificate"
    assert analysis.followup_aspect == "documents"


def test_followup_does_not_override_a_clear_new_service(analyzer):
    context = {"active_service_id": "income_certificate"}
    analysis = analyzer.analyze("मुझे आधार कार्ड बनवाना है", context=context)
    assert analysis.service_id == "aadhaar_enrolment"


# --- Cross-service disambiguation ------------------------------------------


@pytest.mark.parametrize(
    "query,expected",
    [
        ("मुझे जाति प्रमाण पत्र बनवाना है।", "caste_certificate"),
        ("मुझे डोमिसाइल सर्टिफिकेट चाहिए", "domicile_certificate"),
        ("आधार कार्ड बनवाना है", "aadhaar_enrolment"),
        ("पैन कार्ड बनवाना है", "pan_card"),
        ("voter id card kaise banwaye", "voter_id"),
        ("आयुष्मान कार्ड कैसे बनाएं", "ayushman_card"),
        ("मुझे नौकरी चाहिए", "job_registration"),
        ("मनरेगा जॉब कार्ड बनवाना है", "mgnrega_job_card"),
        ("ड्राइविंग लाइसेंस बनवाना है", "driving_licence"),
        ("पीएम आवास योजना में आवेदन करना है", "pm_awas_urban"),
        ("बुढ़ापा पेंशन चाहिए", "old_age_pension"),
    ],
)
def test_every_service_is_reachable(analyzer, query, expected):
    analysis = analyzer.analyze(query)
    assert analysis.service_id == expected, f"{query!r} resolved to {analysis.service_id}"


def test_all_services_have_a_reachable_query(store, analyzer):
    """Guard against adding a service that nobody can ever find by typing."""
    unreachable = []
    for record in store.all_services():
        probes = [record.names["hi"], record.names["en"]]
        probes += record.aliases.get("hi", [])[:2]
        probes += record.aliases.get("en", [])[:2]
        if not any(analyzer.analyze(p).service_id == record.id for p in probes if p):
            unreachable.append(record.id)
    assert not unreachable, f"services not reachable by their own names: {unreachable}"
