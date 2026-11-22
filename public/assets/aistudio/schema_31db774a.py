from typing import Literal
from pydantic import BaseModel, ConfigDict, Field

KINDS = ['Lesson plan', 'Quiz bank', 'Study guide', 'Flashcards', 'Rubric', 'Exit ticket', 'Discussion prompts', 'Concept map', 'Assignment brief']
BLOOMS = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create']


class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid')


class Settings(Strict):
    subject: str = Field(default='General', min_length=1, max_length=100)
    level: Literal['Introductory', 'Intermediate', 'Advanced'] = 'Introductory'
    bloom: Literal['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'] = 'Understand'
    minutes: int = Field(default=45, ge=10, le=240)
    language: Literal['English', 'Spanish', 'French', 'German', 'Hindi'] = 'English'
    tone: Literal['Warm & academic', 'Concise', 'Conversational'] = 'Warm & academic'
    objectives: str = Field(default='', max_length=2000)
    standards: str = Field(default='', max_length=1000)


class Section(Strict):
    heading: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=12000)
    grounding: Literal['Directly supported', 'Reasonable inference', 'Needs educator review']
    source_ids: list[str]


class Card(Strict):
    front: str = Field(min_length=1, max_length=2000)
    back: str = Field(min_length=1, max_length=4000)
    tags: list[str]


class ArtifactData(Strict):
    title: str = Field(min_length=1, max_length=200)
    objectives: list[str]
    sections: list[Section] = Field(min_length=1, max_length=40)
    flashcards: list[Card] = Field(max_length=50)
    quality_flags: list[str]


def validate_artifact(data, source, kind):
    parsed = ArtifactData.model_validate(data)
    valid = {s['id'] for s in source}
    for section in parsed.sections:
        if any(s not in valid for s in section.source_ids):
            raise ValueError('AI returned an unknown source reference.')
        if section.grounding == 'Directly supported' and not section.source_ids:
            raise ValueError('Supported sections must include source references.')
    if kind == 'Flashcards' and not parsed.flashcards:
        raise ValueError('Flashcard deck is empty.')
    return parsed.model_dump()
