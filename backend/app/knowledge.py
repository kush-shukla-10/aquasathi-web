import re


KNOWLEDGE = [
    {
        "id": "ciba-shrimp",
        "title": "ICAR-CIBA: Shrimp aquaculture",
        "publisher": "ICAR–Central Institute of Brackishwater Aquaculture",
        "url": "https://ciba.icar.gov.in/",
        "text": (
            "Good pond preparation, routine water-quality monitoring, biosecurity, "
            "and observation of shrimp behaviour are important parts of responsible "
            "brackishwater shrimp farming. Record measurements consistently and "
            "seek qualified advice when animals show unusual signs."
        ),
    },
    {
        "id": "mpeda-farming",
        "title": "MPEDA: Aquaculture resources",
        "publisher": "Marine Products Export Development Authority",
        "url": "https://mpeda.gov.in/",
        "text": (
            "Use approved aquaculture practices, maintain farm records, and follow "
            "applicable registration and biosecurity guidance. Site and species "
            "conditions affect management decisions; confirm local recommendations "
            "with a qualified aquaculture professional."
        ),
    },
    {
        "id": "fao-vannamei",
        "title": "FAO cultured aquatic species: Whiteleg shrimp",
        "publisher": "Food and Agriculture Organization of the United Nations",
        "url": "https://www.fao.org/fishery/en/culturedspecies/litopenaeus_vannamei?lang=en",
        "text": (
            "Whiteleg shrimp pass through nauplius, zoea, mysis, and post-larval "
            "stages before grow-out. Appropriate husbandry depends on seed quality, "
            "stocking, water conditions, and farm management."
        ),
    },
]

STOP_WORDS = {
    "about",
    "are",
    "can",
    "do",
    "does",
    "exact",
    "for",
    "how",
    "in",
    "is",
    "me",
    "my",
    "of",
    "please",
    "pond",
    "the",
    "what",
    "when",
    "where",
    "which",
    "with",
    "would",
}

TRANSLATED_TERMS = {
    "te": {
        "నీరు": "water",
        "చెరువు": "pond",
        "రొయ్య": "shrimp",
        "రొయ్యలు": "shrimp",
        "పెంపకం": "farming",
        "దశ": "stages",
        "దశలు": "stages",
        "ప్రవర్తన": "behaviour",
        "ఆహారం": "feeding",
        "ఆక్సిజన్": "oxygen",
        "ఉప్పుతనం": "salinity",
        "జీవభద్రత": "biosecurity",
        "పర్యవేక్షణ": "monitoring",
    },
    "hi": {
        "पानी": "water",
        "तालाब": "pond",
        "झींगा": "shrimp",
        "झींगे": "shrimp",
        "पालन": "farming",
        "चरण": "stages",
        "व्यवहार": "behaviour",
        "खुराक": "feeding",
        "ऑक्सीजन": "oxygen",
        "लवणता": "salinity",
        "जैवसुरक्षा": "biosecurity",
        "निगरानी": "monitoring",
    },
}


def retrieve(query: str, limit: int = 3, language: str = "en") -> list[dict[str, str]]:
    lowered_query = query.lower()
    terms = set(re.findall(r"[a-z0-9]{3,}", lowered_query)) - STOP_WORDS
    terms.update(
        english_term
        for phrase, english_term in TRANSLATED_TERMS.get(language, {}).items()
        if phrase in lowered_query
    )
    if not terms:
        return []
    scored = []
    for entry in KNOWLEDGE:
        searchable = f"{entry['title']} {entry['text']}".lower()
        score = sum(term in searchable for term in terms)
        if score:
            scored.append((score, entry))
    scored.sort(key=lambda item: (-item[0], item[1]["id"]))
    return [entry for _, entry in scored[:limit]]


def answer_question(question: str, language: str) -> dict[str, object]:
    matches = retrieve(question, language=language)
    if not matches:
        answers = {
            "en": "I couldn’t find a reliable match in the local reference set. Please add the pond readings or ask an aquaculture expert; no pond-specific diagnosis is available.",
            "te": "స్థానిక నమ్మదగిన సూచనల్లో దీనికి సరిపడే సమాచారం దొరకలేదు. చెరువు కొలతలను జోడించండి లేదా ఆక్వాకల్చర్ నిపుణుడిని సంప్రదించండి.",
            "hi": "स्थानीय विश्वसनीय स्रोतों में इसका मिलान नहीं मिला। कृपया तालाब की रीडिंग जोड़ें या जलीय कृषि विशेषज्ञ से सलाह लें।",
        }
        return {
            "answer": answers[language],
            "citations": [],
            "mode": "local_reference_search",
            "limitation": "No external language model is configured; this is not a pond diagnosis.",
        }

    if language == "te":
        answer = (
            "స్థానిక సూచనల్లో సంబంధిత సమాచారం ఉంది. చెరువు పరిస్థితులను నేరుగా "
            "నిర్ధారించడానికి ఇది సరిపోదు; తాజా కొలతలు నమోదు చేసి నిపుణుడిని సంప్రదించండి."
        )
    elif language == "hi":
        answer = (
            "स्थानीय संदर्भों में संबंधित जानकारी मिली। इससे तालाब की स्थिति की "
            "पुष्टि नहीं होती; ताज़ा रीडिंग दर्ज करें और विशेषज्ञ से सलाह लें।"
        )
    else:
        answer = (
            "The local references include related guidance. This does not confirm "
            "conditions in your pond; record current readings and consult a qualified expert."
        )
    return {
        "answer": answer,
        "citations": [
            {"title": entry["title"], "publisher": entry["publisher"], "url": entry["url"]}
            for entry in matches
        ],
        "mode": "local_reference_search",
        "limitation": "No external language model is configured; this is not a pond diagnosis.",
    }
