from typing import Optional

from pydantic import BaseModel


class SectionBrief(BaseModel):
    section_id: int
    section_name: str
    student_count: int


class ClassTeacherCard(BaseModel):
    section_id: int
    class_id: int
    section_name: str
    class_name: str
    section_label: str
    academic_year_id: int
    academic_year_name: str
    is_current_year: bool
    capacity: int
    student_count: int


class SubjectTeacherCard(BaseModel):
    class_subject_id: int
    class_id: int
    class_name: str
    subject_id: int
    subject_name: str
    subject_code: str
    is_optional: bool
    academic_year_id: int
    academic_year_name: str
    is_current_year: bool
    sections: list[SectionBrief]
    total_students: int


class MyClassesRead(BaseModel):
    class_teacher_of: list[ClassTeacherCard]
    subject_teacher_of: list[SubjectTeacherCard]


class RosterStudent(BaseModel):
    id: int
    admission_no: str
    roll_no: int
    full_name: str
    gender: Optional[str] = None
    dob: Optional[str] = None
    photo_url: Optional[str] = None
