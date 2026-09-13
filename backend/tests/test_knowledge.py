"""Knowledge-base integrity.

These are the guard rails that keep SAARTHI trustworthy: every fact the
assistant states must come from a record that carries a source, a verification
level and a verification date. A record missing any of them fails the build.
"""

from __future__ import annotations

import re

import pytest

ALLOWED_LEVELS = {"verified_official", "general_guidance", "confirm_with_authority"}
GOV_URL_HINTS = ("gov.in", "nic.in", "nha.gov.in", "eci.gov.in", "india.gov.in")

# Not gov.in, but officially authorised by the Income Tax Department to accept
# PAN applications. Anything added here must be a body the government itself
# names as an authorised provider — never a private aggregator or agent site.
ALLOWED_NON_GOV_DOMAINS = {
    "www.onlineservices.nsdl.com",  # Protean (formerly NSDL e-Gov), CBDT-authorised
    "www.utiitsl.com",              # UTIITSL, CBDT-authorised
}


def test_knowledge_base_is_not_empty(store):
    assert len(store.services) >= 6, "MVP needs a meaningful set of services"
    assert len(store.categories) >= 5


def test_every_service_has_a_real_official_url(store):
    """No invented portals, no placeholder links."""
    for record in store.all_services():
        url = record.official_url
        assert url.startswith("https://"), f"{record.id}: official_url must be https"
        assert not any(
            placeholder in url.lower()
            for placeholder in ("example.com", "localhost", "your-domain", "todo", "xxx")
        ), f"{record.id}: placeholder URL {url}"


def test_government_urls_use_government_domains(store):
    """Direct citizens only to official government domains."""
    offenders = []
    for record in store.all_services():
        urls = [record.official_url] + [link.url for link in record.extra_links]
        urls += [sp.portal_url for sp in record.state_portals]
        for url in urls:
            host = re.sub(r"^https?://", "", url).split("/")[0].lower()
            if not any(hint in host for hint in GOV_URL_HINTS) and host not in ALLOWED_NON_GOV_DOMAINS:
                offenders.append(f"{record.id}: {host}")
    assert not offenders, f"non-government domains found: {offenders}"


def test_every_service_is_bilingual(store):
    for record in store.all_services():
        for field in ("names", "tagline", "description", "official_source"):
            value = getattr(record, field)
            assert value.get("hi"), f"{record.id}.{field} missing Hindi"
            assert value.get("en"), f"{record.id}.{field} missing English"


def test_every_localised_item_is_bilingual(store):
    for record in store.all_services():
        for index, item in enumerate(record.eligibility):
            assert item.get("hi") and item.get("en"), f"{record.id}.eligibility[{index}]"
        for index, note in enumerate(record.important_notes):
            assert note.get("hi") and note.get("en"), f"{record.id}.important_notes[{index}]"
        for doc in record.documents:
            assert doc.name.get("hi") and doc.name.get("en"), f"{record.id}.documents.{doc.id}"
        for index, step in enumerate(record.steps):
            assert step.title.get("hi") and step.title.get("en"), f"{record.id}.steps[{index}]"


def test_verification_metadata_is_present_and_valid(store):
    for record in store.all_services():
        assert record.verification.level in ALLOWED_LEVELS, record.id
        assert re.fullmatch(
            r"\d{4}-\d{2}-\d{2}", record.verification.last_verified
        ), f"{record.id}: last_verified must be an ISO date"
        assert record.verification.note.get("en"), f"{record.id}: verification note required"


def test_state_services_disclose_their_variation(store):
    """State-issued services must warn that rules differ by state."""
    for record in store.all_services():
        if record.jurisdiction == "state":
            note = record.verification.note.get("en", "").lower()
            assert "state" in note, f"{record.id}: must tell citizens rules vary by state"
            assert record.state_portals, f"{record.id}: give at least one state portal"


def test_no_service_invents_documents_or_steps(store):
    for record in store.all_services():
        assert record.documents, f"{record.id}: a service must list its documents"
        assert record.steps, f"{record.id}: a service must list its steps"
        ids = [doc.id for doc in record.documents]
        assert len(ids) == len(set(ids)), f"{record.id}: duplicate document ids"


def test_every_service_belongs_to_a_known_category(store):
    for record in store.all_services():
        assert store.get_category(record.category_id) is not None, record.id


def test_related_services_exist(store):
    for record in store.all_services():
        for related_id in record.related_service_ids:
            assert store.get_service(related_id) is not None, f"{record.id} -> {related_id}"


def test_categories_are_ordered_and_bilingual(store):
    for category in store.categories.values():
        assert category.names.get("hi") and category.names.get("en")
        assert category.icon


def test_phrases_cover_both_languages(store):
    """Assistant copy must exist in Hindi and English, or the UI shows blanks."""
    def walk(node, path):
        if isinstance(node, dict):
            if "en" in node or "hi" in node:
                assert node.get("en"), f"{path}: missing English copy"
                assert node.get("hi"), f"{path}: missing Hindi copy"
                return
            for key, value in node.items():
                walk(value, f"{path}.{key}")
        elif isinstance(node, list):
            for index, value in enumerate(node):
                walk(value, f"{path}[{index}]")

    walk(store.phrases.raw, "phrases")


def test_searchable_text_is_populated(store):
    for record in store.all_services():
        assert len(record.searchable_text("hi")) > 40, record.id
        assert len(record.searchable_text("en")) > 40, record.id


def test_aliases_include_both_scripts_for_state_services(store):
    for record in store.all_services():
        assert record.aliases.get("hi"), f"{record.id}: Hindi aliases required"
        assert record.aliases.get("en"), f"{record.id}: English aliases required"


@pytest.mark.parametrize("service_id", ["income_certificate", "national_scholarship", "ayushman_card"])
def test_key_demo_services_exist(store, service_id):
    assert store.get_service(service_id) is not None
