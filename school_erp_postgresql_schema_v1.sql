-- School Management ERP PostgreSQL Schema v1
-- Generated design baseline. Review school-specific statutory/privacy settings before production.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE tenants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(160) NOT NULL,
    code varchar(40) NOT NULL,
    status varchar(30) NOT NULL,
    region varchar(40),
    subscription_plan varchar(60),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    email varchar(255),
    mobile varchar(20),
    username varchar(120),
    status varchar(30) NOT NULL,
    last_login_at timestamptz,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE user_credentials (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    password_hash text,
    identity_provider varchar(40),
    must_change_password boolean NOT NULL,
    password_changed_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE user_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    issued_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    device_info jsonb,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE mfa_challenges (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    reference_no varchar(60),
    status varchar(30) NOT NULL,
    remarks text,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE password_reset_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    reference_no varchar(60),
    status varchar(30) NOT NULL,
    remarks text,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    name varchar(100) NOT NULL,
    code varchar(60) NOT NULL,
    scope_type varchar(30) NOT NULL,
    description text,
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE permissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    resource varchar(100) NOT NULL,
    action varchar(40) NOT NULL,
    code varchar(140) NOT NULL,
    sensitivity varchar(30),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE role_permissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    role_id uuid NOT NULL,
    permission_id uuid NOT NULL,
    effect varchar(10) NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE user_role_assignments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role_id uuid NOT NULL,
    school_id uuid,
    branch_id uuid,
    start_date date,
    end_date date,
    status varchar(30) NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE organizations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    name varchar(160) NOT NULL,
    code varchar(40) NOT NULL,
    legal_name varchar(200),
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE schools (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    name varchar(160) NOT NULL,
    code varchar(40) NOT NULL,
    board_type varchar(60),
    timezone varchar(60) NOT NULL,
    email varchar(255),
    mobile varchar(20),
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE branches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    school_id uuid NOT NULL,
    name varchar(160) NOT NULL,
    code varchar(40) NOT NULL,
    address_json jsonb,
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE academic_years (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    school_id uuid NOT NULL,
    name varchar(30) NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    is_current boolean NOT NULL,
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE terms (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    academic_year_id uuid NOT NULL,
    name varchar(80) NOT NULL,
    sequence_no integer NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE departments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    school_id uuid NOT NULL,
    name varchar(120) NOT NULL,
    code varchar(30) NOT NULL,
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE grades (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    school_id uuid NOT NULL,
    name varchar(80) NOT NULL,
    code varchar(30) NOT NULL,
    sequence_no integer NOT NULL,
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE sections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    grade_id uuid NOT NULL,
    name varchar(40) NOT NULL,
    code varchar(20) NOT NULL,
    capacity integer,
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE subjects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    school_id uuid NOT NULL,
    department_id uuid,
    name varchar(120) NOT NULL,
    code varchar(30) NOT NULL,
    subject_type varchar(30),
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE rooms (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    branch_id uuid,
    name varchar(80) NOT NULL,
    code varchar(30) NOT NULL,
    room_type varchar(40),
    capacity integer,
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE admission_enquiries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    academic_year_id uuid NOT NULL,
    student_name varchar(160) NOT NULL,
    guardian_name varchar(160) NOT NULL,
    mobile varchar(20) NOT NULL,
    email varchar(255),
    grade_id uuid NOT NULL,
    source varchar(60),
    stage varchar(30) NOT NULL,
    assigned_to uuid,
    next_followup_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE enquiry_followups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    entity_id uuid NOT NULL,
    from_status varchar(30),
    to_status varchar(30),
    effective_at timestamptz NOT NULL,
    reason text,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE admission_applications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    enquiry_id uuid,
    application_no varchar(40) NOT NULL,
    academic_year_id uuid NOT NULL,
    grade_id uuid NOT NULL,
    student_name varchar(160) NOT NULL,
    date_of_birth date,
    status varchar(30) NOT NULL,
    submitted_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE application_documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    owner_id uuid NOT NULL,
    document_type varchar(60) NOT NULL,
    file_key text NOT NULL,
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE admission_assessments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    application_id uuid NOT NULL,
    assessment_type varchar(40) NOT NULL,
    scheduled_at timestamptz,
    max_score numeric(8,2),
    score numeric(8,2),
    result varchar(30),
    evaluator_id uuid,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE admission_decisions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    application_id uuid NOT NULL,
    decision varchar(30) NOT NULL,
    reason text,
    decided_by uuid NOT NULL,
    decided_at timestamptz NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE admission_status_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    entity_id uuid NOT NULL,
    from_status varchar(30),
    to_status varchar(30),
    effective_at timestamptz NOT NULL,
    reason text,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE students (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    admission_no varchar(50) NOT NULL,
    first_name varchar(100) NOT NULL,
    last_name varchar(100),
    date_of_birth date,
    gender varchar(20),
    email varchar(255),
    mobile varchar(20),
    status varchar(30) NOT NULL,
    admitted_on date,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE student_enrollments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    student_id uuid NOT NULL,
    academic_year_id uuid NOT NULL,
    grade_id uuid NOT NULL,
    section_id uuid NOT NULL,
    roll_no varchar(30),
    start_date date NOT NULL,
    end_date date,
    status varchar(30) NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE student_status_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    entity_id uuid NOT NULL,
    from_status varchar(30),
    to_status varchar(30),
    effective_at timestamptz NOT NULL,
    reason text,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE guardians (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    full_name varchar(160) NOT NULL,
    relationship_type varchar(40) NOT NULL,
    mobile varchar(20) NOT NULL,
    email varchar(255),
    occupation varchar(120),
    verification_status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE student_guardians (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    student_id uuid NOT NULL,
    guardian_id uuid NOT NULL,
    is_primary boolean NOT NULL,
    can_pickup boolean NOT NULL,
    portal_access boolean NOT NULL,
    start_date date,
    end_date date,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE guardian_preferences (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    name varchar(160) NOT NULL,
    code varchar(50),
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE student_contacts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    reference_no varchar(60),
    status varchar(30) NOT NULL,
    remarks text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE student_notes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    reference_no varchar(60),
    status varchar(30) NOT NULL,
    remarks text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE student_tags (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    left_id uuid NOT NULL,
    right_id uuid NOT NULL,
    status varchar(30) NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE alumni_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    reference_no varchar(60),
    status varchar(30) NOT NULL,
    remarks text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE employees (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    employee_no varchar(50) NOT NULL,
    department_id uuid,
    first_name varchar(100) NOT NULL,
    last_name varchar(100),
    designation varchar(120) NOT NULL,
    employment_type varchar(40),
    joining_date date NOT NULL,
    exit_date date,
    email varchar(255),
    mobile varchar(20),
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE employment_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    entity_id uuid NOT NULL,
    from_status varchar(30),
    to_status varchar(30),
    effective_at timestamptz NOT NULL,
    reason text,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE teacher_assignments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    academic_year_id uuid NOT NULL,
    grade_id uuid NOT NULL,
    section_id uuid,
    subject_id uuid NOT NULL,
    start_date date NOT NULL,
    end_date date,
    status varchar(30) NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE employee_qualifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    reference_no varchar(60),
    status varchar(30) NOT NULL,
    remarks text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE employee_documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    owner_id uuid NOT NULL,
    document_type varchar(60) NOT NULL,
    file_key text NOT NULL,
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE employee_emergency_contacts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    reference_no varchar(60),
    status varchar(30) NOT NULL,
    remarks text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE employee_bank_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    owner_id uuid NOT NULL,
    recorded_at timestamptz NOT NULL,
    details text,
    privacy_level varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE staff_notes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    reference_no varchar(60),
    status varchar(30) NOT NULL,
    remarks text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE curricula (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    academic_year_id uuid NOT NULL,
    grade_id uuid NOT NULL,
    subject_id uuid NOT NULL,
    version_no integer NOT NULL,
    status varchar(30) NOT NULL,
    published_at timestamptz,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE curriculum_units (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    curriculum_id uuid NOT NULL,
    parent_unit_id uuid,
    unit_type varchar(30) NOT NULL,
    title varchar(200) NOT NULL,
    sequence_no integer NOT NULL,
    planned_hours numeric(8,2),
    status varchar(30) NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE learning_outcomes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    name varchar(160) NOT NULL,
    code varchar(50),
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE lesson_plans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    academic_year_id uuid NOT NULL,
    grade_id uuid NOT NULL,
    section_id uuid,
    subject_id uuid NOT NULL,
    curriculum_unit_id uuid,
    planned_date date NOT NULL,
    actual_date date,
    status varchar(30) NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE lesson_plan_resources (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    left_id uuid NOT NULL,
    right_id uuid NOT NULL,
    status varchar(30) NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE lesson_plan_reviews (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    entity_id uuid NOT NULL,
    decision varchar(30) NOT NULL,
    reason text,
    decided_by uuid NOT NULL,
    decided_at timestamptz NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE syllabus_progress (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    reference_no varchar(60),
    status varchar(30) NOT NULL,
    remarks text,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE academic_calendar_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    reference_no varchar(60),
    status varchar(30) NOT NULL,
    remarks text,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE teaching_resources (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    owner_id uuid NOT NULL,
    document_type varchar(60) NOT NULL,
    file_key text NOT NULL,
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE academic_policies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    name varchar(160) NOT NULL,
    code varchar(50),
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE attendance_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    attendance_date date NOT NULL,
    academic_year_id uuid NOT NULL,
    grade_id uuid NOT NULL,
    section_id uuid NOT NULL,
    subject_id uuid,
    period_definition_id uuid,
    session_type varchar(30) NOT NULL,
    status varchar(30) NOT NULL,
    locked_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE student_attendance (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    attendance_session_id uuid NOT NULL,
    student_id uuid NOT NULL,
    attendance_status varchar(30) NOT NULL,
    marked_by uuid NOT NULL,
    marked_at timestamptz NOT NULL,
    remarks text,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE attendance_corrections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    entity_id uuid NOT NULL,
    decision varchar(30) NOT NULL,
    reason text,
    decided_by uuid NOT NULL,
    decided_at timestamptz NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE student_leave_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    reference_no varchar(60),
    status varchar(30) NOT NULL,
    remarks text,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE student_leave_approvals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    entity_id uuid NOT NULL,
    decision varchar(30) NOT NULL,
    reason text,
    decided_by uuid NOT NULL,
    decided_at timestamptz NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE attendance_policies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    name varchar(160) NOT NULL,
    code varchar(50),
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE period_definitions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    name varchar(160) NOT NULL,
    code varchar(50),
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE timetables (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    academic_year_id uuid NOT NULL,
    grade_id uuid,
    section_id uuid,
    employee_id uuid,
    version_no integer NOT NULL,
    effective_from date NOT NULL,
    effective_to date,
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE timetable_slots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    timetable_id uuid NOT NULL,
    day_of_week smallint NOT NULL,
    period_definition_id uuid NOT NULL,
    subject_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    room_id uuid,
    status varchar(30) NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE teacher_availability (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    name varchar(160) NOT NULL,
    code varchar(50),
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE substitutions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    reference_no varchar(60),
    status varchar(30) NOT NULL,
    remarks text,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE schedule_conflicts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    event_type varchar(60) NOT NULL,
    event_at timestamptz NOT NULL,
    actor_id uuid,
    payload_json jsonb,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE learning_tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    task_type varchar(30) NOT NULL,
    academic_year_id uuid NOT NULL,
    grade_id uuid NOT NULL,
    section_id uuid,
    subject_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    title varchar(200) NOT NULL,
    instructions text,
    published_at timestamptz,
    due_at timestamptz NOT NULL,
    max_score numeric(8,2),
    status varchar(30) NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE task_attachments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    owner_id uuid NOT NULL,
    document_type varchar(60) NOT NULL,
    file_key text NOT NULL,
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE task_submissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    learning_task_id uuid NOT NULL,
    student_id uuid NOT NULL,
    submitted_at timestamptz,
    submission_text text,
    status varchar(30) NOT NULL,
    version_no integer NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE submission_attachments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    owner_id uuid NOT NULL,
    document_type varchar(60) NOT NULL,
    file_key text NOT NULL,
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE task_evaluations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    reference_no varchar(60),
    status varchar(30) NOT NULL,
    remarks text,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE rubrics (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    name varchar(160) NOT NULL,
    code varchar(50),
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE exam_types (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    name varchar(160) NOT NULL,
    code varchar(50),
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE exams (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    exam_type_id uuid NOT NULL,
    academic_year_id uuid NOT NULL,
    term_id uuid,
    name varchar(160) NOT NULL,
    start_date date,
    end_date date,
    status varchar(30) NOT NULL,
    publish_results_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE exam_components (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    name varchar(160) NOT NULL,
    code varchar(50),
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE exam_schedules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    exam_id uuid NOT NULL,
    grade_id uuid NOT NULL,
    subject_id uuid NOT NULL,
    exam_date date NOT NULL,
    start_time time NOT NULL,
    end_time time NOT NULL,
    room_id uuid,
    max_marks numeric(8,2) NOT NULL,
    pass_marks numeric(8,2),
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE exam_invigilators (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    left_id uuid NOT NULL,
    right_id uuid NOT NULL,
    status varchar(30) NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE mark_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    exam_id uuid NOT NULL,
    student_id uuid NOT NULL,
    subject_id uuid NOT NULL,
    exam_component_id uuid,
    marks numeric(8,2),
    mark_status varchar(30) NOT NULL,
    entered_by uuid NOT NULL,
    verified_by uuid,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE mark_verifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    entity_id uuid NOT NULL,
    decision varchar(30) NOT NULL,
    reason text,
    decided_by uuid NOT NULL,
    decided_at timestamptz NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE grade_scales (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    name varchar(100) NOT NULL,
    academic_year_id uuid,
    grade_json jsonb NOT NULL,
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE results (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    exam_id uuid NOT NULL,
    student_id uuid NOT NULL,
    total_marks numeric(10,2),
    percentage numeric(7,2),
    grade varchar(20),
    result_status varchar(30) NOT NULL,
    version_no integer NOT NULL,
    published_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE report_cards (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    owner_id uuid NOT NULL,
    document_type varchar(60) NOT NULL,
    file_key text NOT NULL,
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE fee_heads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    name varchar(120) NOT NULL,
    code varchar(30) NOT NULL,
    fee_type varchar(30),
    refundable boolean NOT NULL,
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE fee_structures (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    academic_year_id uuid NOT NULL,
    grade_id uuid,
    name varchar(160) NOT NULL,
    version_no integer NOT NULL,
    effective_from date NOT NULL,
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE fee_structure_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    reference_no varchar(60),
    status varchar(30) NOT NULL,
    remarks text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE student_fee_assignments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    reference_no varchar(60),
    status varchar(30) NOT NULL,
    remarks text,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE student_fee_charges (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    student_id uuid NOT NULL,
    fee_head_id uuid NOT NULL,
    academic_year_id uuid NOT NULL,
    due_date date NOT NULL,
    amount numeric(14,2) NOT NULL,
    discount_amount numeric(14,2) NOT NULL,
    fine_amount numeric(14,2) NOT NULL,
    paid_amount numeric(14,2) NOT NULL,
    balance_amount numeric(14,2) NOT NULL,
    status varchar(30) NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE concessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    reference_no varchar(60),
    transaction_date date NOT NULL,
    amount numeric(14,2) NOT NULL,
    status varchar(30) NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE fine_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    name varchar(160) NOT NULL,
    code varchar(50),
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE fines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    reference_no varchar(60),
    transaction_date date NOT NULL,
    amount numeric(14,2) NOT NULL,
    status varchar(30) NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    student_id uuid,
    payer_name varchar(160),
    amount numeric(14,2) NOT NULL,
    payment_mode varchar(30) NOT NULL,
    provider varchar(40),
    provider_reference varchar(120),
    payment_status varchar(30) NOT NULL,
    paid_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE payment_allocations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    reference_no varchar(60),
    transaction_date date NOT NULL,
    amount numeric(14,2) NOT NULL,
    status varchar(30) NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE receipts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    receipt_no varchar(50) NOT NULL,
    payment_id uuid NOT NULL,
    student_id uuid,
    amount numeric(14,2) NOT NULL,
    issued_at timestamptz NOT NULL,
    status varchar(30) NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE refunds (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    payment_id uuid NOT NULL,
    amount numeric(14,2) NOT NULL,
    reason text NOT NULL,
    status varchar(30) NOT NULL,
    approved_by uuid,
    provider_reference varchar(120),
    refunded_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE finance_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    name varchar(160) NOT NULL,
    code varchar(50),
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE finance_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    reference_no varchar(60),
    transaction_date date NOT NULL,
    amount numeric(14,2) NOT NULL,
    status varchar(30) NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE vendors (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    name varchar(160) NOT NULL,
    code varchar(50),
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE job_openings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    reference_no varchar(60),
    status varchar(30) NOT NULL,
    remarks text,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE candidates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    name varchar(160) NOT NULL,
    code varchar(50),
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE candidate_applications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    reference_no varchar(60),
    status varchar(30) NOT NULL,
    remarks text,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE interview_schedules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    reference_no varchar(60),
    status varchar(30) NOT NULL,
    remarks text,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE offers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    reference_no varchar(60),
    status varchar(30) NOT NULL,
    remarks text,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE leave_types (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    name varchar(160) NOT NULL,
    code varchar(50),
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE leave_policies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    name varchar(160) NOT NULL,
    code varchar(50),
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE leave_balances (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    reference_no varchar(60),
    status varchar(30) NOT NULL,
    remarks text,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE leave_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    leave_type_id uuid NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    units numeric(6,2) NOT NULL,
    reason text,
    status varchar(30) NOT NULL,
    submitted_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE payroll_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    scope_json jsonb,
    status varchar(30) NOT NULL,
    calculated_at timestamptz,
    approved_at timestamptz,
    posted_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE vehicles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    registration_no varchar(40) NOT NULL,
    vehicle_type varchar(40) NOT NULL,
    capacity integer NOT NULL,
    make_model varchar(120),
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE vehicle_documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    owner_id uuid NOT NULL,
    document_type varchar(60) NOT NULL,
    file_key text NOT NULL,
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE vehicle_maintenance (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    reference_no varchar(60),
    status varchar(30) NOT NULL,
    remarks text,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE fuel_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    reference_no varchar(60),
    status varchar(30) NOT NULL,
    remarks text,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE transport_routes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    name varchar(120) NOT NULL,
    code varchar(30) NOT NULL,
    effective_from date NOT NULL,
    effective_to date,
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE transport_stops (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    name varchar(160) NOT NULL,
    code varchar(50),
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE route_stops (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    left_id uuid NOT NULL,
    right_id uuid NOT NULL,
    status varchar(30) NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE transport_assignments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    student_id uuid NOT NULL,
    route_id uuid NOT NULL,
    stop_id uuid NOT NULL,
    service_type varchar(30) NOT NULL,
    start_date date NOT NULL,
    end_date date,
    status varchar(30) NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE trips (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    route_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    driver_employee_id uuid,
    trip_date date NOT NULL,
    planned_start_at timestamptz,
    actual_start_at timestamptz,
    actual_end_at timestamptz,
    status varchar(30) NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE trip_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    reference_no varchar(60),
    status varchar(30) NOT NULL,
    remarks text,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE book_titles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    isbn varchar(30),
    title varchar(250) NOT NULL,
    author_text varchar(250),
    category varchar(100),
    publisher varchar(160),
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE book_copies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    book_title_id uuid NOT NULL,
    barcode varchar(60) NOT NULL,
    location_code varchar(80),
    copy_status varchar(30) NOT NULL,
    acquired_on date,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE library_memberships (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    left_id uuid NOT NULL,
    right_id uuid NOT NULL,
    status varchar(30) NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE circulation_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    book_copy_id uuid NOT NULL,
    member_type varchar(30) NOT NULL,
    member_id uuid NOT NULL,
    issued_at timestamptz NOT NULL,
    due_at timestamptz NOT NULL,
    returned_at timestamptz,
    status varchar(30) NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE reservations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    reference_no varchar(60),
    status varchar(30) NOT NULL,
    remarks text,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE library_fines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    reference_no varchar(60),
    transaction_date date NOT NULL,
    amount numeric(14,2) NOT NULL,
    status varchar(30) NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE digital_resources (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    owner_id uuid NOT NULL,
    document_type varchar(60) NOT NULL,
    file_key text NOT NULL,
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE library_access_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    event_type varchar(60) NOT NULL,
    event_at timestamptz NOT NULL,
    actor_id uuid,
    payload_json jsonb,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE hostels (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    name varchar(160) NOT NULL,
    code varchar(50),
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE hostel_rooms (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    name varchar(160) NOT NULL,
    code varchar(50),
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE hostel_beds (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    name varchar(160) NOT NULL,
    code varchar(50),
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE hostel_allocations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    student_id uuid NOT NULL,
    hostel_bed_id uuid NOT NULL,
    start_date date NOT NULL,
    end_date date,
    status varchar(30) NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE hostel_attendance (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    reference_no varchar(60),
    status varchar(30) NOT NULL,
    remarks text,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE outing_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    reference_no varchar(60),
    status varchar(30) NOT NULL,
    remarks text,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE hostel_complaints (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    reference_no varchar(60),
    status varchar(30) NOT NULL,
    remarks text,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE medical_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    student_id uuid NOT NULL,
    blood_group varchar(10),
    conditions text,
    emergency_notes text,
    privacy_level varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE allergies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    owner_id uuid NOT NULL,
    recorded_at timestamptz NOT NULL,
    details text,
    privacy_level varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE medications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    owner_id uuid NOT NULL,
    recorded_at timestamptz NOT NULL,
    details text,
    privacy_level varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE clinic_visits (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    student_id uuid NOT NULL,
    visited_at timestamptz NOT NULL,
    complaint text NOT NULL,
    observations text,
    treatment text,
    disposition varchar(40),
    clinician_id uuid NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE counselling_cases (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    owner_id uuid NOT NULL,
    recorded_at timestamptz NOT NULL,
    details text,
    privacy_level varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE counselling_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    owner_id uuid NOT NULL,
    recorded_at timestamptz NOT NULL,
    details text,
    privacy_level varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE discipline_incidents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    student_id uuid NOT NULL,
    incident_date date NOT NULL,
    category varchar(60) NOT NULL,
    description text NOT NULL,
    severity varchar(30) NOT NULL,
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE discipline_actions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    owner_id uuid NOT NULL,
    recorded_at timestamptz NOT NULL,
    details text,
    privacy_level varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE visitors (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    full_name varchar(160) NOT NULL,
    mobile varchar(20) NOT NULL,
    id_type varchar(40),
    id_value_hash text,
    is_restricted boolean NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE visits (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    visitor_id uuid NOT NULL,
    host_employee_id uuid,
    purpose varchar(200) NOT NULL,
    planned_at timestamptz,
    checked_in_at timestamptz,
    checked_out_at timestamptz,
    status varchar(30) NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE visitor_approvals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    entity_id uuid NOT NULL,
    decision varchar(30) NOT NULL,
    reason text,
    decided_by uuid NOT NULL,
    decided_at timestamptz NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE visitor_passes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    reference_no varchar(60),
    status varchar(30) NOT NULL,
    remarks text,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE gate_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    event_type varchar(60) NOT NULL,
    event_at timestamptz NOT NULL,
    actor_id uuid,
    payload_json jsonb,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE security_incidents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    event_type varchar(60) NOT NULL,
    event_at timestamptz NOT NULL,
    actor_id uuid,
    payload_json jsonb,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE suppliers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    name varchar(160) NOT NULL,
    code varchar(50),
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE inventory_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    sku varchar(60) NOT NULL,
    name varchar(160) NOT NULL,
    category varchar(80),
    uom varchar(20) NOT NULL,
    reorder_level numeric(12,3),
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE inventory_locations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    name varchar(160) NOT NULL,
    code varchar(50),
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE stock_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    inventory_item_id uuid NOT NULL,
    location_id uuid NOT NULL,
    transaction_type varchar(30) NOT NULL,
    quantity numeric(12,3) NOT NULL,
    reference_type varchar(40),
    reference_id uuid,
    transaction_at timestamptz NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE assets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    asset_tag varchar(60) NOT NULL,
    inventory_item_id uuid,
    serial_no varchar(120),
    location_id uuid,
    asset_status varchar(30) NOT NULL,
    purchase_date date,
    warranty_end_date date,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE asset_assignments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    reference_no varchar(60),
    status varchar(30) NOT NULL,
    remarks text,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE asset_maintenance (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    reference_no varchar(60),
    status varchar(30) NOT NULL,
    remarks text,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE labs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    name varchar(160) NOT NULL,
    code varchar(50),
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE lab_bookings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    reference_no varchar(60),
    status varchar(30) NOT NULL,
    remarks text,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    title varchar(200) NOT NULL,
    event_type varchar(50) NOT NULL,
    starts_at timestamptz NOT NULL,
    ends_at timestamptz,
    venue varchar(200),
    audience_json jsonb,
    status varchar(30) NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE event_participants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    left_id uuid NOT NULL,
    right_id uuid NOT NULL,
    status varchar(30) NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE consent_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    entity_id uuid NOT NULL,
    decision varchar(30) NOT NULL,
    reason text,
    decided_by uuid NOT NULL,
    decided_at timestamptz NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE ptm_schedules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    reference_no varchar(60),
    status varchar(30) NOT NULL,
    remarks text,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE ptm_slots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    reference_no varchar(60),
    status varchar(30) NOT NULL,
    remarks text,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE announcements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    title varchar(200) NOT NULL,
    body text NOT NULL,
    audience_json jsonb NOT NULL,
    scheduled_at timestamptz,
    published_at timestamptz,
    status varchar(30) NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE message_threads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    subject varchar(200),
    thread_type varchar(40) NOT NULL,
    context_type varchar(40),
    context_id uuid,
    status varchar(30) NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    message_thread_id uuid NOT NULL,
    sender_user_id uuid NOT NULL,
    body text NOT NULL,
    sent_at timestamptz NOT NULL,
    message_status varchar(30) NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    owner_type varchar(40) NOT NULL,
    owner_id uuid NOT NULL,
    document_type varchar(60) NOT NULL,
    file_key text NOT NULL,
    version_no integer NOT NULL,
    issue_date date,
    expiry_date date,
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE document_verifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    entity_id uuid NOT NULL,
    decision varchar(30) NOT NULL,
    reason text,
    decided_by uuid NOT NULL,
    decided_at timestamptz NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE certificate_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    name varchar(160) NOT NULL,
    code varchar(50),
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE certificate_sequences (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    name varchar(160) NOT NULL,
    code varchar(50),
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE certificate_issues (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    certificate_template_id uuid NOT NULL,
    certificate_no varchar(60) NOT NULL,
    owner_type varchar(40) NOT NULL,
    owner_id uuid NOT NULL,
    snapshot_json jsonb NOT NULL,
    issued_at timestamptz NOT NULL,
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE transfer_certificates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    owner_id uuid NOT NULL,
    document_type varchar(60) NOT NULL,
    file_key text NOT NULL,
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE metric_definitions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    name varchar(160) NOT NULL,
    code varchar(50),
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE report_definitions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    name varchar(160) NOT NULL,
    code varchar(50),
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE saved_reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    name varchar(160) NOT NULL,
    code varchar(50),
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE export_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    reference_no varchar(60),
    status varchar(30) NOT NULL,
    remarks text,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE custom_fields (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    name varchar(160) NOT NULL,
    code varchar(50),
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE system_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    scope_type varchar(30) NOT NULL,
    scope_id uuid,
    setting_key varchar(160) NOT NULL,
    setting_value jsonb NOT NULL,
    effective_from timestamptz,
    status varchar(30) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE integration_configs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    provider varchar(80) NOT NULL,
    integration_type varchar(60) NOT NULL,
    scope_type varchar(30) NOT NULL,
    scope_id uuid,
    config_json jsonb,
    secret_ref text,
    status varchar(30) NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE webhook_deliveries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    event_type varchar(60) NOT NULL,
    event_at timestamptz NOT NULL,
    actor_id uuid,
    payload_json jsonb,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE audit_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    actor_user_id uuid,
    action varchar(80) NOT NULL,
    target_type varchar(80) NOT NULL,
    target_id uuid,
    event_at timestamptz NOT NULL,
    correlation_id varchar(100),
    metadata_json jsonb,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE import_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    import_type varchar(60) NOT NULL,
    file_key text NOT NULL,
    status varchar(30) NOT NULL,
    total_rows integer,
    success_rows integer,
    error_rows integer,
    started_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid,
    row_version integer DEFAULT 1 NOT NULL
);

ALTER TABLE users ADD CONSTRAINT fk_users_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE user_credentials ADD CONSTRAINT fk_user_credentials_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE user_credentials ADD CONSTRAINT fk_user_credentials_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION;
ALTER TABLE user_sessions ADD CONSTRAINT fk_user_sessions_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE user_sessions ADD CONSTRAINT fk_user_sessions_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION;
ALTER TABLE mfa_challenges ADD CONSTRAINT fk_mfa_challenges_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE password_reset_tokens ADD CONSTRAINT fk_password_reset_tokens_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE roles ADD CONSTRAINT fk_roles_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE permissions ADD CONSTRAINT fk_permissions_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE role_permissions ADD CONSTRAINT fk_role_permissions_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE role_permissions ADD CONSTRAINT fk_role_permissions_role_id FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE NO ACTION;
ALTER TABLE role_permissions ADD CONSTRAINT fk_role_permissions_permission_id FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE NO ACTION;
ALTER TABLE user_role_assignments ADD CONSTRAINT fk_user_role_assignments_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE user_role_assignments ADD CONSTRAINT fk_user_role_assignments_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION;
ALTER TABLE user_role_assignments ADD CONSTRAINT fk_user_role_assignments_role_id FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE NO ACTION;
ALTER TABLE user_role_assignments ADD CONSTRAINT fk_user_role_assignments_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE user_role_assignments ADD CONSTRAINT fk_user_role_assignments_branch_id FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE NO ACTION;
ALTER TABLE organizations ADD CONSTRAINT fk_organizations_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE schools ADD CONSTRAINT fk_schools_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE schools ADD CONSTRAINT fk_schools_organization_id FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE NO ACTION;
ALTER TABLE branches ADD CONSTRAINT fk_branches_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE branches ADD CONSTRAINT fk_branches_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE branches ADD CONSTRAINT fk_branches_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE academic_years ADD CONSTRAINT fk_academic_years_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE academic_years ADD CONSTRAINT fk_academic_years_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE academic_years ADD CONSTRAINT fk_academic_years_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE terms ADD CONSTRAINT fk_terms_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE terms ADD CONSTRAINT fk_terms_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE terms ADD CONSTRAINT fk_terms_academic_year_id FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE RESTRICT;
ALTER TABLE departments ADD CONSTRAINT fk_departments_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE departments ADD CONSTRAINT fk_departments_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE departments ADD CONSTRAINT fk_departments_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE grades ADD CONSTRAINT fk_grades_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE grades ADD CONSTRAINT fk_grades_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE grades ADD CONSTRAINT fk_grades_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE sections ADD CONSTRAINT fk_sections_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE sections ADD CONSTRAINT fk_sections_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE sections ADD CONSTRAINT fk_sections_grade_id FOREIGN KEY (grade_id) REFERENCES grades(id) ON DELETE NO ACTION;
ALTER TABLE subjects ADD CONSTRAINT fk_subjects_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE subjects ADD CONSTRAINT fk_subjects_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE subjects ADD CONSTRAINT fk_subjects_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE subjects ADD CONSTRAINT fk_subjects_department_id FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE NO ACTION;
ALTER TABLE rooms ADD CONSTRAINT fk_rooms_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE rooms ADD CONSTRAINT fk_rooms_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE rooms ADD CONSTRAINT fk_rooms_branch_id FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE NO ACTION;
ALTER TABLE admission_enquiries ADD CONSTRAINT fk_admission_enquiries_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE admission_enquiries ADD CONSTRAINT fk_admission_enquiries_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE admission_enquiries ADD CONSTRAINT fk_admission_enquiries_academic_year_id FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE RESTRICT;
ALTER TABLE admission_enquiries ADD CONSTRAINT fk_admission_enquiries_grade_id FOREIGN KEY (grade_id) REFERENCES grades(id) ON DELETE NO ACTION;
ALTER TABLE admission_enquiries ADD CONSTRAINT fk_admission_enquiries_assigned_to FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE NO ACTION;
ALTER TABLE enquiry_followups ADD CONSTRAINT fk_enquiry_followups_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE enquiry_followups ADD CONSTRAINT fk_enquiry_followups_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE admission_applications ADD CONSTRAINT fk_admission_applications_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE admission_applications ADD CONSTRAINT fk_admission_applications_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE admission_applications ADD CONSTRAINT fk_admission_applications_enquiry_id FOREIGN KEY (enquiry_id) REFERENCES admission_enquiries(id) ON DELETE NO ACTION;
ALTER TABLE admission_applications ADD CONSTRAINT fk_admission_applications_academic_year_id FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE RESTRICT;
ALTER TABLE admission_applications ADD CONSTRAINT fk_admission_applications_grade_id FOREIGN KEY (grade_id) REFERENCES grades(id) ON DELETE NO ACTION;
ALTER TABLE application_documents ADD CONSTRAINT fk_application_documents_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE application_documents ADD CONSTRAINT fk_application_documents_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE admission_assessments ADD CONSTRAINT fk_admission_assessments_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE admission_assessments ADD CONSTRAINT fk_admission_assessments_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE admission_assessments ADD CONSTRAINT fk_admission_assessments_application_id FOREIGN KEY (application_id) REFERENCES admission_applications(id) ON DELETE NO ACTION;
ALTER TABLE admission_assessments ADD CONSTRAINT fk_admission_assessments_evaluator_id FOREIGN KEY (evaluator_id) REFERENCES employees(id) ON DELETE NO ACTION;
ALTER TABLE admission_decisions ADD CONSTRAINT fk_admission_decisions_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE admission_decisions ADD CONSTRAINT fk_admission_decisions_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE admission_decisions ADD CONSTRAINT fk_admission_decisions_application_id FOREIGN KEY (application_id) REFERENCES admission_applications(id) ON DELETE NO ACTION;
ALTER TABLE admission_decisions ADD CONSTRAINT fk_admission_decisions_decided_by FOREIGN KEY (decided_by) REFERENCES users(id) ON DELETE NO ACTION;
ALTER TABLE admission_status_history ADD CONSTRAINT fk_admission_status_history_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE admission_status_history ADD CONSTRAINT fk_admission_status_history_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE students ADD CONSTRAINT fk_students_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE students ADD CONSTRAINT fk_students_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE student_enrollments ADD CONSTRAINT fk_student_enrollments_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE student_enrollments ADD CONSTRAINT fk_student_enrollments_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE student_enrollments ADD CONSTRAINT fk_student_enrollments_student_id FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE NO ACTION;
ALTER TABLE student_enrollments ADD CONSTRAINT fk_student_enrollments_academic_year_id FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE RESTRICT;
ALTER TABLE student_enrollments ADD CONSTRAINT fk_student_enrollments_grade_id FOREIGN KEY (grade_id) REFERENCES grades(id) ON DELETE NO ACTION;
ALTER TABLE student_enrollments ADD CONSTRAINT fk_student_enrollments_section_id FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE NO ACTION;
ALTER TABLE student_status_history ADD CONSTRAINT fk_student_status_history_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE student_status_history ADD CONSTRAINT fk_student_status_history_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE guardians ADD CONSTRAINT fk_guardians_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE guardians ADD CONSTRAINT fk_guardians_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE student_guardians ADD CONSTRAINT fk_student_guardians_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE student_guardians ADD CONSTRAINT fk_student_guardians_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE student_guardians ADD CONSTRAINT fk_student_guardians_student_id FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE NO ACTION;
ALTER TABLE student_guardians ADD CONSTRAINT fk_student_guardians_guardian_id FOREIGN KEY (guardian_id) REFERENCES guardians(id) ON DELETE NO ACTION;
ALTER TABLE guardian_preferences ADD CONSTRAINT fk_guardian_preferences_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE guardian_preferences ADD CONSTRAINT fk_guardian_preferences_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE student_contacts ADD CONSTRAINT fk_student_contacts_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE student_contacts ADD CONSTRAINT fk_student_contacts_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE student_notes ADD CONSTRAINT fk_student_notes_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE student_notes ADD CONSTRAINT fk_student_notes_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE student_tags ADD CONSTRAINT fk_student_tags_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE student_tags ADD CONSTRAINT fk_student_tags_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE alumni_profiles ADD CONSTRAINT fk_alumni_profiles_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE alumni_profiles ADD CONSTRAINT fk_alumni_profiles_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE employees ADD CONSTRAINT fk_employees_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE employees ADD CONSTRAINT fk_employees_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE employees ADD CONSTRAINT fk_employees_department_id FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE NO ACTION;
ALTER TABLE employment_history ADD CONSTRAINT fk_employment_history_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE employment_history ADD CONSTRAINT fk_employment_history_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE teacher_assignments ADD CONSTRAINT fk_teacher_assignments_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE teacher_assignments ADD CONSTRAINT fk_teacher_assignments_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE teacher_assignments ADD CONSTRAINT fk_teacher_assignments_employee_id FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE NO ACTION;
ALTER TABLE teacher_assignments ADD CONSTRAINT fk_teacher_assignments_academic_year_id FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE RESTRICT;
ALTER TABLE teacher_assignments ADD CONSTRAINT fk_teacher_assignments_grade_id FOREIGN KEY (grade_id) REFERENCES grades(id) ON DELETE NO ACTION;
ALTER TABLE teacher_assignments ADD CONSTRAINT fk_teacher_assignments_section_id FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE NO ACTION;
ALTER TABLE teacher_assignments ADD CONSTRAINT fk_teacher_assignments_subject_id FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE NO ACTION;
ALTER TABLE employee_qualifications ADD CONSTRAINT fk_employee_qualifications_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE employee_qualifications ADD CONSTRAINT fk_employee_qualifications_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE employee_documents ADD CONSTRAINT fk_employee_documents_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE employee_documents ADD CONSTRAINT fk_employee_documents_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE employee_emergency_contacts ADD CONSTRAINT fk_employee_emergency_contacts_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE employee_emergency_contacts ADD CONSTRAINT fk_employee_emergency_contacts_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE employee_bank_accounts ADD CONSTRAINT fk_employee_bank_accounts_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE employee_bank_accounts ADD CONSTRAINT fk_employee_bank_accounts_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE staff_notes ADD CONSTRAINT fk_staff_notes_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE staff_notes ADD CONSTRAINT fk_staff_notes_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE curricula ADD CONSTRAINT fk_curricula_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE curricula ADD CONSTRAINT fk_curricula_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE curricula ADD CONSTRAINT fk_curricula_academic_year_id FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE RESTRICT;
ALTER TABLE curricula ADD CONSTRAINT fk_curricula_grade_id FOREIGN KEY (grade_id) REFERENCES grades(id) ON DELETE NO ACTION;
ALTER TABLE curricula ADD CONSTRAINT fk_curricula_subject_id FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE NO ACTION;
ALTER TABLE curriculum_units ADD CONSTRAINT fk_curriculum_units_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE curriculum_units ADD CONSTRAINT fk_curriculum_units_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE curriculum_units ADD CONSTRAINT fk_curriculum_units_curriculum_id FOREIGN KEY (curriculum_id) REFERENCES curricula(id) ON DELETE NO ACTION;
ALTER TABLE learning_outcomes ADD CONSTRAINT fk_learning_outcomes_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE learning_outcomes ADD CONSTRAINT fk_learning_outcomes_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE lesson_plans ADD CONSTRAINT fk_lesson_plans_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE lesson_plans ADD CONSTRAINT fk_lesson_plans_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE lesson_plans ADD CONSTRAINT fk_lesson_plans_employee_id FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE NO ACTION;
ALTER TABLE lesson_plans ADD CONSTRAINT fk_lesson_plans_academic_year_id FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE RESTRICT;
ALTER TABLE lesson_plans ADD CONSTRAINT fk_lesson_plans_grade_id FOREIGN KEY (grade_id) REFERENCES grades(id) ON DELETE NO ACTION;
ALTER TABLE lesson_plans ADD CONSTRAINT fk_lesson_plans_section_id FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE NO ACTION;
ALTER TABLE lesson_plans ADD CONSTRAINT fk_lesson_plans_subject_id FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE NO ACTION;
ALTER TABLE lesson_plans ADD CONSTRAINT fk_lesson_plans_curriculum_unit_id FOREIGN KEY (curriculum_unit_id) REFERENCES curriculum_units(id) ON DELETE NO ACTION;
ALTER TABLE lesson_plan_resources ADD CONSTRAINT fk_lesson_plan_resources_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE lesson_plan_resources ADD CONSTRAINT fk_lesson_plan_resources_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE lesson_plan_reviews ADD CONSTRAINT fk_lesson_plan_reviews_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE lesson_plan_reviews ADD CONSTRAINT fk_lesson_plan_reviews_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE lesson_plan_reviews ADD CONSTRAINT fk_lesson_plan_reviews_decided_by FOREIGN KEY (decided_by) REFERENCES users(id) ON DELETE NO ACTION;
ALTER TABLE syllabus_progress ADD CONSTRAINT fk_syllabus_progress_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE syllabus_progress ADD CONSTRAINT fk_syllabus_progress_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE academic_calendar_events ADD CONSTRAINT fk_academic_calendar_events_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE academic_calendar_events ADD CONSTRAINT fk_academic_calendar_events_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE teaching_resources ADD CONSTRAINT fk_teaching_resources_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE teaching_resources ADD CONSTRAINT fk_teaching_resources_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE academic_policies ADD CONSTRAINT fk_academic_policies_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE academic_policies ADD CONSTRAINT fk_academic_policies_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE attendance_sessions ADD CONSTRAINT fk_attendance_sessions_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE attendance_sessions ADD CONSTRAINT fk_attendance_sessions_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE attendance_sessions ADD CONSTRAINT fk_attendance_sessions_academic_year_id FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE RESTRICT;
ALTER TABLE attendance_sessions ADD CONSTRAINT fk_attendance_sessions_grade_id FOREIGN KEY (grade_id) REFERENCES grades(id) ON DELETE NO ACTION;
ALTER TABLE attendance_sessions ADD CONSTRAINT fk_attendance_sessions_section_id FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE NO ACTION;
ALTER TABLE attendance_sessions ADD CONSTRAINT fk_attendance_sessions_subject_id FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE NO ACTION;
ALTER TABLE attendance_sessions ADD CONSTRAINT fk_attendance_sessions_period_definition_id FOREIGN KEY (period_definition_id) REFERENCES period_definitions(id) ON DELETE NO ACTION;
ALTER TABLE student_attendance ADD CONSTRAINT fk_student_attendance_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE student_attendance ADD CONSTRAINT fk_student_attendance_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE student_attendance ADD CONSTRAINT fk_student_attendance_attendance_session_id FOREIGN KEY (attendance_session_id) REFERENCES attendance_sessions(id) ON DELETE NO ACTION;
ALTER TABLE student_attendance ADD CONSTRAINT fk_student_attendance_student_id FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE NO ACTION;
ALTER TABLE attendance_corrections ADD CONSTRAINT fk_attendance_corrections_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE attendance_corrections ADD CONSTRAINT fk_attendance_corrections_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE attendance_corrections ADD CONSTRAINT fk_attendance_corrections_decided_by FOREIGN KEY (decided_by) REFERENCES users(id) ON DELETE NO ACTION;
ALTER TABLE student_leave_requests ADD CONSTRAINT fk_student_leave_requests_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE student_leave_requests ADD CONSTRAINT fk_student_leave_requests_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE student_leave_approvals ADD CONSTRAINT fk_student_leave_approvals_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE student_leave_approvals ADD CONSTRAINT fk_student_leave_approvals_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE student_leave_approvals ADD CONSTRAINT fk_student_leave_approvals_decided_by FOREIGN KEY (decided_by) REFERENCES users(id) ON DELETE NO ACTION;
ALTER TABLE attendance_policies ADD CONSTRAINT fk_attendance_policies_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE attendance_policies ADD CONSTRAINT fk_attendance_policies_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE period_definitions ADD CONSTRAINT fk_period_definitions_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE period_definitions ADD CONSTRAINT fk_period_definitions_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE timetables ADD CONSTRAINT fk_timetables_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE timetables ADD CONSTRAINT fk_timetables_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE timetables ADD CONSTRAINT fk_timetables_academic_year_id FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE RESTRICT;
ALTER TABLE timetables ADD CONSTRAINT fk_timetables_grade_id FOREIGN KEY (grade_id) REFERENCES grades(id) ON DELETE NO ACTION;
ALTER TABLE timetables ADD CONSTRAINT fk_timetables_section_id FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE NO ACTION;
ALTER TABLE timetables ADD CONSTRAINT fk_timetables_employee_id FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE NO ACTION;
ALTER TABLE timetable_slots ADD CONSTRAINT fk_timetable_slots_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE timetable_slots ADD CONSTRAINT fk_timetable_slots_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE timetable_slots ADD CONSTRAINT fk_timetable_slots_timetable_id FOREIGN KEY (timetable_id) REFERENCES timetables(id) ON DELETE NO ACTION;
ALTER TABLE timetable_slots ADD CONSTRAINT fk_timetable_slots_period_definition_id FOREIGN KEY (period_definition_id) REFERENCES period_definitions(id) ON DELETE NO ACTION;
ALTER TABLE timetable_slots ADD CONSTRAINT fk_timetable_slots_subject_id FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE NO ACTION;
ALTER TABLE timetable_slots ADD CONSTRAINT fk_timetable_slots_employee_id FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE NO ACTION;
ALTER TABLE timetable_slots ADD CONSTRAINT fk_timetable_slots_room_id FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE NO ACTION;
ALTER TABLE teacher_availability ADD CONSTRAINT fk_teacher_availability_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE teacher_availability ADD CONSTRAINT fk_teacher_availability_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE substitutions ADD CONSTRAINT fk_substitutions_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE substitutions ADD CONSTRAINT fk_substitutions_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE schedule_conflicts ADD CONSTRAINT fk_schedule_conflicts_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE schedule_conflicts ADD CONSTRAINT fk_schedule_conflicts_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE learning_tasks ADD CONSTRAINT fk_learning_tasks_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE learning_tasks ADD CONSTRAINT fk_learning_tasks_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE learning_tasks ADD CONSTRAINT fk_learning_tasks_academic_year_id FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE RESTRICT;
ALTER TABLE learning_tasks ADD CONSTRAINT fk_learning_tasks_grade_id FOREIGN KEY (grade_id) REFERENCES grades(id) ON DELETE NO ACTION;
ALTER TABLE learning_tasks ADD CONSTRAINT fk_learning_tasks_section_id FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE NO ACTION;
ALTER TABLE learning_tasks ADD CONSTRAINT fk_learning_tasks_subject_id FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE NO ACTION;
ALTER TABLE learning_tasks ADD CONSTRAINT fk_learning_tasks_employee_id FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE NO ACTION;
ALTER TABLE task_attachments ADD CONSTRAINT fk_task_attachments_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE task_attachments ADD CONSTRAINT fk_task_attachments_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE task_submissions ADD CONSTRAINT fk_task_submissions_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE task_submissions ADD CONSTRAINT fk_task_submissions_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE task_submissions ADD CONSTRAINT fk_task_submissions_learning_task_id FOREIGN KEY (learning_task_id) REFERENCES learning_tasks(id) ON DELETE NO ACTION;
ALTER TABLE task_submissions ADD CONSTRAINT fk_task_submissions_student_id FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE NO ACTION;
ALTER TABLE submission_attachments ADD CONSTRAINT fk_submission_attachments_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE submission_attachments ADD CONSTRAINT fk_submission_attachments_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE task_evaluations ADD CONSTRAINT fk_task_evaluations_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE task_evaluations ADD CONSTRAINT fk_task_evaluations_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE rubrics ADD CONSTRAINT fk_rubrics_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE rubrics ADD CONSTRAINT fk_rubrics_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE exam_types ADD CONSTRAINT fk_exam_types_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE exam_types ADD CONSTRAINT fk_exam_types_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE exams ADD CONSTRAINT fk_exams_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE exams ADD CONSTRAINT fk_exams_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE exams ADD CONSTRAINT fk_exams_exam_type_id FOREIGN KEY (exam_type_id) REFERENCES exam_types(id) ON DELETE NO ACTION;
ALTER TABLE exams ADD CONSTRAINT fk_exams_academic_year_id FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE RESTRICT;
ALTER TABLE exams ADD CONSTRAINT fk_exams_term_id FOREIGN KEY (term_id) REFERENCES terms(id) ON DELETE NO ACTION;
ALTER TABLE exam_components ADD CONSTRAINT fk_exam_components_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE exam_components ADD CONSTRAINT fk_exam_components_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE exam_schedules ADD CONSTRAINT fk_exam_schedules_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE exam_schedules ADD CONSTRAINT fk_exam_schedules_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE exam_schedules ADD CONSTRAINT fk_exam_schedules_exam_id FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE NO ACTION;
ALTER TABLE exam_schedules ADD CONSTRAINT fk_exam_schedules_grade_id FOREIGN KEY (grade_id) REFERENCES grades(id) ON DELETE NO ACTION;
ALTER TABLE exam_schedules ADD CONSTRAINT fk_exam_schedules_subject_id FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE NO ACTION;
ALTER TABLE exam_schedules ADD CONSTRAINT fk_exam_schedules_room_id FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE NO ACTION;
ALTER TABLE exam_invigilators ADD CONSTRAINT fk_exam_invigilators_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE exam_invigilators ADD CONSTRAINT fk_exam_invigilators_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE mark_entries ADD CONSTRAINT fk_mark_entries_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE mark_entries ADD CONSTRAINT fk_mark_entries_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE mark_entries ADD CONSTRAINT fk_mark_entries_exam_id FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE NO ACTION;
ALTER TABLE mark_entries ADD CONSTRAINT fk_mark_entries_student_id FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE NO ACTION;
ALTER TABLE mark_entries ADD CONSTRAINT fk_mark_entries_subject_id FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE NO ACTION;
ALTER TABLE mark_entries ADD CONSTRAINT fk_mark_entries_exam_component_id FOREIGN KEY (exam_component_id) REFERENCES exam_components(id) ON DELETE NO ACTION;
ALTER TABLE mark_entries ADD CONSTRAINT fk_mark_entries_entered_by FOREIGN KEY (entered_by) REFERENCES users(id) ON DELETE NO ACTION;
ALTER TABLE mark_entries ADD CONSTRAINT fk_mark_entries_verified_by FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE NO ACTION;
ALTER TABLE mark_verifications ADD CONSTRAINT fk_mark_verifications_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE mark_verifications ADD CONSTRAINT fk_mark_verifications_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE mark_verifications ADD CONSTRAINT fk_mark_verifications_decided_by FOREIGN KEY (decided_by) REFERENCES users(id) ON DELETE NO ACTION;
ALTER TABLE grade_scales ADD CONSTRAINT fk_grade_scales_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE grade_scales ADD CONSTRAINT fk_grade_scales_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE grade_scales ADD CONSTRAINT fk_grade_scales_academic_year_id FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE RESTRICT;
ALTER TABLE results ADD CONSTRAINT fk_results_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE results ADD CONSTRAINT fk_results_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE results ADD CONSTRAINT fk_results_exam_id FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE NO ACTION;
ALTER TABLE results ADD CONSTRAINT fk_results_student_id FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE NO ACTION;
ALTER TABLE report_cards ADD CONSTRAINT fk_report_cards_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE report_cards ADD CONSTRAINT fk_report_cards_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE fee_heads ADD CONSTRAINT fk_fee_heads_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE fee_heads ADD CONSTRAINT fk_fee_heads_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE fee_structures ADD CONSTRAINT fk_fee_structures_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE fee_structures ADD CONSTRAINT fk_fee_structures_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE fee_structures ADD CONSTRAINT fk_fee_structures_academic_year_id FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE RESTRICT;
ALTER TABLE fee_structures ADD CONSTRAINT fk_fee_structures_grade_id FOREIGN KEY (grade_id) REFERENCES grades(id) ON DELETE NO ACTION;
ALTER TABLE fee_structure_items ADD CONSTRAINT fk_fee_structure_items_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE fee_structure_items ADD CONSTRAINT fk_fee_structure_items_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE student_fee_assignments ADD CONSTRAINT fk_student_fee_assignments_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE student_fee_assignments ADD CONSTRAINT fk_student_fee_assignments_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE student_fee_charges ADD CONSTRAINT fk_student_fee_charges_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE student_fee_charges ADD CONSTRAINT fk_student_fee_charges_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE student_fee_charges ADD CONSTRAINT fk_student_fee_charges_student_id FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE NO ACTION;
ALTER TABLE student_fee_charges ADD CONSTRAINT fk_student_fee_charges_fee_head_id FOREIGN KEY (fee_head_id) REFERENCES fee_heads(id) ON DELETE NO ACTION;
ALTER TABLE student_fee_charges ADD CONSTRAINT fk_student_fee_charges_academic_year_id FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE RESTRICT;
ALTER TABLE concessions ADD CONSTRAINT fk_concessions_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE concessions ADD CONSTRAINT fk_concessions_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE fine_rules ADD CONSTRAINT fk_fine_rules_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE fine_rules ADD CONSTRAINT fk_fine_rules_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE fines ADD CONSTRAINT fk_fines_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE fines ADD CONSTRAINT fk_fines_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE payments ADD CONSTRAINT fk_payments_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE payments ADD CONSTRAINT fk_payments_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE payments ADD CONSTRAINT fk_payments_student_id FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE NO ACTION;
ALTER TABLE payment_allocations ADD CONSTRAINT fk_payment_allocations_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE payment_allocations ADD CONSTRAINT fk_payment_allocations_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE receipts ADD CONSTRAINT fk_receipts_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE receipts ADD CONSTRAINT fk_receipts_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE receipts ADD CONSTRAINT fk_receipts_payment_id FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE NO ACTION;
ALTER TABLE receipts ADD CONSTRAINT fk_receipts_student_id FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE NO ACTION;
ALTER TABLE refunds ADD CONSTRAINT fk_refunds_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE refunds ADD CONSTRAINT fk_refunds_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE refunds ADD CONSTRAINT fk_refunds_payment_id FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE NO ACTION;
ALTER TABLE finance_accounts ADD CONSTRAINT fk_finance_accounts_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE finance_accounts ADD CONSTRAINT fk_finance_accounts_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE finance_transactions ADD CONSTRAINT fk_finance_transactions_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE finance_transactions ADD CONSTRAINT fk_finance_transactions_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE vendors ADD CONSTRAINT fk_vendors_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE vendors ADD CONSTRAINT fk_vendors_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE job_openings ADD CONSTRAINT fk_job_openings_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE job_openings ADD CONSTRAINT fk_job_openings_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE candidates ADD CONSTRAINT fk_candidates_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE candidates ADD CONSTRAINT fk_candidates_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE candidate_applications ADD CONSTRAINT fk_candidate_applications_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE candidate_applications ADD CONSTRAINT fk_candidate_applications_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE interview_schedules ADD CONSTRAINT fk_interview_schedules_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE interview_schedules ADD CONSTRAINT fk_interview_schedules_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE offers ADD CONSTRAINT fk_offers_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE offers ADD CONSTRAINT fk_offers_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE leave_types ADD CONSTRAINT fk_leave_types_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE leave_types ADD CONSTRAINT fk_leave_types_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE leave_policies ADD CONSTRAINT fk_leave_policies_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE leave_policies ADD CONSTRAINT fk_leave_policies_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE leave_balances ADD CONSTRAINT fk_leave_balances_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE leave_balances ADD CONSTRAINT fk_leave_balances_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE leave_requests ADD CONSTRAINT fk_leave_requests_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE leave_requests ADD CONSTRAINT fk_leave_requests_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE leave_requests ADD CONSTRAINT fk_leave_requests_employee_id FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE NO ACTION;
ALTER TABLE leave_requests ADD CONSTRAINT fk_leave_requests_leave_type_id FOREIGN KEY (leave_type_id) REFERENCES leave_types(id) ON DELETE NO ACTION;
ALTER TABLE payroll_runs ADD CONSTRAINT fk_payroll_runs_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE payroll_runs ADD CONSTRAINT fk_payroll_runs_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE vehicles ADD CONSTRAINT fk_vehicles_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE vehicles ADD CONSTRAINT fk_vehicles_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE vehicle_documents ADD CONSTRAINT fk_vehicle_documents_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE vehicle_documents ADD CONSTRAINT fk_vehicle_documents_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE vehicle_maintenance ADD CONSTRAINT fk_vehicle_maintenance_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE vehicle_maintenance ADD CONSTRAINT fk_vehicle_maintenance_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE fuel_logs ADD CONSTRAINT fk_fuel_logs_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE fuel_logs ADD CONSTRAINT fk_fuel_logs_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE transport_routes ADD CONSTRAINT fk_transport_routes_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE transport_routes ADD CONSTRAINT fk_transport_routes_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE transport_stops ADD CONSTRAINT fk_transport_stops_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE transport_stops ADD CONSTRAINT fk_transport_stops_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE route_stops ADD CONSTRAINT fk_route_stops_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE route_stops ADD CONSTRAINT fk_route_stops_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE transport_assignments ADD CONSTRAINT fk_transport_assignments_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE transport_assignments ADD CONSTRAINT fk_transport_assignments_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE transport_assignments ADD CONSTRAINT fk_transport_assignments_student_id FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE NO ACTION;
ALTER TABLE transport_assignments ADD CONSTRAINT fk_transport_assignments_route_id FOREIGN KEY (route_id) REFERENCES transport_routes(id) ON DELETE NO ACTION;
ALTER TABLE transport_assignments ADD CONSTRAINT fk_transport_assignments_stop_id FOREIGN KEY (stop_id) REFERENCES transport_stops(id) ON DELETE NO ACTION;
ALTER TABLE trips ADD CONSTRAINT fk_trips_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE trips ADD CONSTRAINT fk_trips_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE trips ADD CONSTRAINT fk_trips_route_id FOREIGN KEY (route_id) REFERENCES transport_routes(id) ON DELETE NO ACTION;
ALTER TABLE trips ADD CONSTRAINT fk_trips_vehicle_id FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE NO ACTION;
ALTER TABLE trips ADD CONSTRAINT fk_trips_driver_employee_id FOREIGN KEY (driver_employee_id) REFERENCES employees(id) ON DELETE NO ACTION;
ALTER TABLE trip_events ADD CONSTRAINT fk_trip_events_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE trip_events ADD CONSTRAINT fk_trip_events_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE book_titles ADD CONSTRAINT fk_book_titles_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE book_titles ADD CONSTRAINT fk_book_titles_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE book_copies ADD CONSTRAINT fk_book_copies_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE book_copies ADD CONSTRAINT fk_book_copies_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE book_copies ADD CONSTRAINT fk_book_copies_book_title_id FOREIGN KEY (book_title_id) REFERENCES book_titles(id) ON DELETE NO ACTION;
ALTER TABLE library_memberships ADD CONSTRAINT fk_library_memberships_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE library_memberships ADD CONSTRAINT fk_library_memberships_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE circulation_transactions ADD CONSTRAINT fk_circulation_transactions_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE circulation_transactions ADD CONSTRAINT fk_circulation_transactions_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE circulation_transactions ADD CONSTRAINT fk_circulation_transactions_book_copy_id FOREIGN KEY (book_copy_id) REFERENCES book_copies(id) ON DELETE NO ACTION;
ALTER TABLE reservations ADD CONSTRAINT fk_reservations_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE reservations ADD CONSTRAINT fk_reservations_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE library_fines ADD CONSTRAINT fk_library_fines_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE library_fines ADD CONSTRAINT fk_library_fines_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE digital_resources ADD CONSTRAINT fk_digital_resources_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE digital_resources ADD CONSTRAINT fk_digital_resources_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE library_access_logs ADD CONSTRAINT fk_library_access_logs_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE library_access_logs ADD CONSTRAINT fk_library_access_logs_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE hostels ADD CONSTRAINT fk_hostels_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE hostels ADD CONSTRAINT fk_hostels_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE hostel_rooms ADD CONSTRAINT fk_hostel_rooms_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE hostel_rooms ADD CONSTRAINT fk_hostel_rooms_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE hostel_beds ADD CONSTRAINT fk_hostel_beds_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE hostel_beds ADD CONSTRAINT fk_hostel_beds_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE hostel_allocations ADD CONSTRAINT fk_hostel_allocations_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE hostel_allocations ADD CONSTRAINT fk_hostel_allocations_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE hostel_allocations ADD CONSTRAINT fk_hostel_allocations_student_id FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE NO ACTION;
ALTER TABLE hostel_allocations ADD CONSTRAINT fk_hostel_allocations_hostel_bed_id FOREIGN KEY (hostel_bed_id) REFERENCES hostel_beds(id) ON DELETE NO ACTION;
ALTER TABLE hostel_attendance ADD CONSTRAINT fk_hostel_attendance_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE hostel_attendance ADD CONSTRAINT fk_hostel_attendance_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE outing_requests ADD CONSTRAINT fk_outing_requests_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE outing_requests ADD CONSTRAINT fk_outing_requests_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE hostel_complaints ADD CONSTRAINT fk_hostel_complaints_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE hostel_complaints ADD CONSTRAINT fk_hostel_complaints_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE medical_profiles ADD CONSTRAINT fk_medical_profiles_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE medical_profiles ADD CONSTRAINT fk_medical_profiles_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE medical_profiles ADD CONSTRAINT fk_medical_profiles_student_id FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE NO ACTION;
ALTER TABLE allergies ADD CONSTRAINT fk_allergies_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE allergies ADD CONSTRAINT fk_allergies_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE medications ADD CONSTRAINT fk_medications_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE medications ADD CONSTRAINT fk_medications_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE clinic_visits ADD CONSTRAINT fk_clinic_visits_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE clinic_visits ADD CONSTRAINT fk_clinic_visits_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE clinic_visits ADD CONSTRAINT fk_clinic_visits_student_id FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE NO ACTION;
ALTER TABLE clinic_visits ADD CONSTRAINT fk_clinic_visits_clinician_id FOREIGN KEY (clinician_id) REFERENCES employees(id) ON DELETE NO ACTION;
ALTER TABLE counselling_cases ADD CONSTRAINT fk_counselling_cases_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE counselling_cases ADD CONSTRAINT fk_counselling_cases_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE counselling_sessions ADD CONSTRAINT fk_counselling_sessions_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE counselling_sessions ADD CONSTRAINT fk_counselling_sessions_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE discipline_incidents ADD CONSTRAINT fk_discipline_incidents_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE discipline_incidents ADD CONSTRAINT fk_discipline_incidents_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE discipline_incidents ADD CONSTRAINT fk_discipline_incidents_student_id FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE NO ACTION;
ALTER TABLE discipline_actions ADD CONSTRAINT fk_discipline_actions_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE discipline_actions ADD CONSTRAINT fk_discipline_actions_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE visitors ADD CONSTRAINT fk_visitors_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE visitors ADD CONSTRAINT fk_visitors_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE visits ADD CONSTRAINT fk_visits_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE visits ADD CONSTRAINT fk_visits_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE visits ADD CONSTRAINT fk_visits_visitor_id FOREIGN KEY (visitor_id) REFERENCES visitors(id) ON DELETE NO ACTION;
ALTER TABLE visits ADD CONSTRAINT fk_visits_host_employee_id FOREIGN KEY (host_employee_id) REFERENCES employees(id) ON DELETE NO ACTION;
ALTER TABLE visitor_approvals ADD CONSTRAINT fk_visitor_approvals_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE visitor_approvals ADD CONSTRAINT fk_visitor_approvals_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE visitor_approvals ADD CONSTRAINT fk_visitor_approvals_decided_by FOREIGN KEY (decided_by) REFERENCES users(id) ON DELETE NO ACTION;
ALTER TABLE visitor_passes ADD CONSTRAINT fk_visitor_passes_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE visitor_passes ADD CONSTRAINT fk_visitor_passes_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE gate_events ADD CONSTRAINT fk_gate_events_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE gate_events ADD CONSTRAINT fk_gate_events_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE security_incidents ADD CONSTRAINT fk_security_incidents_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE security_incidents ADD CONSTRAINT fk_security_incidents_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE suppliers ADD CONSTRAINT fk_suppliers_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE suppliers ADD CONSTRAINT fk_suppliers_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE inventory_items ADD CONSTRAINT fk_inventory_items_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE inventory_items ADD CONSTRAINT fk_inventory_items_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE inventory_locations ADD CONSTRAINT fk_inventory_locations_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE inventory_locations ADD CONSTRAINT fk_inventory_locations_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE stock_transactions ADD CONSTRAINT fk_stock_transactions_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE stock_transactions ADD CONSTRAINT fk_stock_transactions_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE stock_transactions ADD CONSTRAINT fk_stock_transactions_inventory_item_id FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id) ON DELETE NO ACTION;
ALTER TABLE stock_transactions ADD CONSTRAINT fk_stock_transactions_location_id FOREIGN KEY (location_id) REFERENCES inventory_locations(id) ON DELETE NO ACTION;
ALTER TABLE assets ADD CONSTRAINT fk_assets_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE assets ADD CONSTRAINT fk_assets_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE assets ADD CONSTRAINT fk_assets_inventory_item_id FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id) ON DELETE NO ACTION;
ALTER TABLE assets ADD CONSTRAINT fk_assets_location_id FOREIGN KEY (location_id) REFERENCES inventory_locations(id) ON DELETE NO ACTION;
ALTER TABLE asset_assignments ADD CONSTRAINT fk_asset_assignments_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE asset_assignments ADD CONSTRAINT fk_asset_assignments_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE asset_maintenance ADD CONSTRAINT fk_asset_maintenance_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE asset_maintenance ADD CONSTRAINT fk_asset_maintenance_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE labs ADD CONSTRAINT fk_labs_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE labs ADD CONSTRAINT fk_labs_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE lab_bookings ADD CONSTRAINT fk_lab_bookings_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE lab_bookings ADD CONSTRAINT fk_lab_bookings_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE events ADD CONSTRAINT fk_events_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE events ADD CONSTRAINT fk_events_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE event_participants ADD CONSTRAINT fk_event_participants_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE event_participants ADD CONSTRAINT fk_event_participants_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE consent_requests ADD CONSTRAINT fk_consent_requests_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE consent_requests ADD CONSTRAINT fk_consent_requests_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE consent_requests ADD CONSTRAINT fk_consent_requests_decided_by FOREIGN KEY (decided_by) REFERENCES users(id) ON DELETE NO ACTION;
ALTER TABLE ptm_schedules ADD CONSTRAINT fk_ptm_schedules_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE ptm_schedules ADD CONSTRAINT fk_ptm_schedules_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE ptm_slots ADD CONSTRAINT fk_ptm_slots_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE ptm_slots ADD CONSTRAINT fk_ptm_slots_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE announcements ADD CONSTRAINT fk_announcements_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE announcements ADD CONSTRAINT fk_announcements_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE message_threads ADD CONSTRAINT fk_message_threads_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE message_threads ADD CONSTRAINT fk_message_threads_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE messages ADD CONSTRAINT fk_messages_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE messages ADD CONSTRAINT fk_messages_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE messages ADD CONSTRAINT fk_messages_message_thread_id FOREIGN KEY (message_thread_id) REFERENCES message_threads(id) ON DELETE NO ACTION;
ALTER TABLE messages ADD CONSTRAINT fk_messages_sender_user_id FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE NO ACTION;
ALTER TABLE documents ADD CONSTRAINT fk_documents_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE documents ADD CONSTRAINT fk_documents_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE document_verifications ADD CONSTRAINT fk_document_verifications_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE document_verifications ADD CONSTRAINT fk_document_verifications_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE document_verifications ADD CONSTRAINT fk_document_verifications_decided_by FOREIGN KEY (decided_by) REFERENCES users(id) ON DELETE NO ACTION;
ALTER TABLE certificate_templates ADD CONSTRAINT fk_certificate_templates_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE certificate_templates ADD CONSTRAINT fk_certificate_templates_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE certificate_sequences ADD CONSTRAINT fk_certificate_sequences_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE certificate_sequences ADD CONSTRAINT fk_certificate_sequences_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE certificate_issues ADD CONSTRAINT fk_certificate_issues_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE certificate_issues ADD CONSTRAINT fk_certificate_issues_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE certificate_issues ADD CONSTRAINT fk_certificate_issues_certificate_template_id FOREIGN KEY (certificate_template_id) REFERENCES certificate_templates(id) ON DELETE NO ACTION;
ALTER TABLE transfer_certificates ADD CONSTRAINT fk_transfer_certificates_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE transfer_certificates ADD CONSTRAINT fk_transfer_certificates_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE metric_definitions ADD CONSTRAINT fk_metric_definitions_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE metric_definitions ADD CONSTRAINT fk_metric_definitions_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE report_definitions ADD CONSTRAINT fk_report_definitions_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE report_definitions ADD CONSTRAINT fk_report_definitions_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE saved_reports ADD CONSTRAINT fk_saved_reports_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE saved_reports ADD CONSTRAINT fk_saved_reports_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE export_jobs ADD CONSTRAINT fk_export_jobs_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE export_jobs ADD CONSTRAINT fk_export_jobs_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE custom_fields ADD CONSTRAINT fk_custom_fields_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE custom_fields ADD CONSTRAINT fk_custom_fields_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE system_settings ADD CONSTRAINT fk_system_settings_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE system_settings ADD CONSTRAINT fk_system_settings_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE integration_configs ADD CONSTRAINT fk_integration_configs_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE integration_configs ADD CONSTRAINT fk_integration_configs_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE webhook_deliveries ADD CONSTRAINT fk_webhook_deliveries_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE webhook_deliveries ADD CONSTRAINT fk_webhook_deliveries_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE audit_events ADD CONSTRAINT fk_audit_events_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE audit_events ADD CONSTRAINT fk_audit_events_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE audit_events ADD CONSTRAINT fk_audit_events_actor_user_id FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE NO ACTION;
ALTER TABLE import_jobs ADD CONSTRAINT fk_import_jobs_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE import_jobs ADD CONSTRAINT fk_import_jobs_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
CREATE INDEX idx_tenants_status ON tenants (status);
CREATE UNIQUE INDEX uq_tenants_code ON tenants (code);
CREATE INDEX idx_users_tenant ON users (tenant_id);
CREATE INDEX idx_users_status ON users (status);
CREATE UNIQUE INDEX uq_users_tenant_id_email ON users (tenant_id,email);
CREATE INDEX idx_user_credentials_tenant ON user_credentials (tenant_id);
CREATE INDEX idx_user_sessions_tenant ON user_sessions (tenant_id);
CREATE INDEX idx_mfa_challenges_tenant ON mfa_challenges (tenant_id);
CREATE INDEX idx_mfa_challenges_status ON mfa_challenges (status);
CREATE INDEX idx_password_reset_tokens_tenant ON password_reset_tokens (tenant_id);
CREATE INDEX idx_password_reset_tokens_status ON password_reset_tokens (status);
CREATE INDEX idx_roles_tenant ON roles (tenant_id);
CREATE INDEX idx_roles_status ON roles (status);
CREATE UNIQUE INDEX uq_roles_tenant_id_code ON roles (tenant_id,code);
CREATE INDEX idx_permissions_tenant ON permissions (tenant_id);
CREATE UNIQUE INDEX uq_permissions_code ON permissions (code);
CREATE INDEX idx_role_permissions_tenant ON role_permissions (tenant_id);
CREATE INDEX idx_user_role_assignments_tenant ON user_role_assignments (tenant_id);
CREATE INDEX idx_user_role_assignments_school ON user_role_assignments (school_id);
CREATE INDEX idx_user_role_assignments_status ON user_role_assignments (status);
CREATE INDEX idx_organizations_tenant ON organizations (tenant_id);
CREATE INDEX idx_organizations_status ON organizations (status);
CREATE UNIQUE INDEX uq_organizations_tenant_id_code ON organizations (tenant_id,code);
CREATE INDEX idx_schools_tenant ON schools (tenant_id);
CREATE INDEX idx_schools_status ON schools (status);
CREATE UNIQUE INDEX uq_schools_tenant_id_code ON schools (tenant_id,code);
CREATE INDEX idx_branches_tenant ON branches (tenant_id);
CREATE INDEX idx_branches_school ON branches (school_id);
CREATE INDEX idx_branches_status ON branches (status);
CREATE UNIQUE INDEX uq_branches_school_id_code ON branches (school_id,code);
CREATE INDEX idx_academic_years_tenant ON academic_years (tenant_id);
CREATE INDEX idx_academic_years_school ON academic_years (school_id);
CREATE INDEX idx_academic_years_status ON academic_years (status);
CREATE UNIQUE INDEX uq_academic_years_school_id_name ON academic_years (school_id,name);
CREATE INDEX idx_terms_tenant ON terms (tenant_id);
CREATE INDEX idx_terms_school ON terms (school_id);
CREATE INDEX idx_terms_status ON terms (status);
CREATE INDEX idx_departments_tenant ON departments (tenant_id);
CREATE INDEX idx_departments_school ON departments (school_id);
CREATE INDEX idx_departments_status ON departments (status);
CREATE UNIQUE INDEX uq_departments_school_id_code ON departments (school_id,code);
CREATE INDEX idx_grades_tenant ON grades (tenant_id);
CREATE INDEX idx_grades_school ON grades (school_id);
CREATE INDEX idx_grades_status ON grades (status);
CREATE UNIQUE INDEX uq_grades_school_id_code ON grades (school_id,code);
CREATE INDEX idx_sections_tenant ON sections (tenant_id);
CREATE INDEX idx_sections_school ON sections (school_id);
CREATE INDEX idx_sections_status ON sections (status);
CREATE INDEX idx_subjects_tenant ON subjects (tenant_id);
CREATE INDEX idx_subjects_school ON subjects (school_id);
CREATE INDEX idx_subjects_status ON subjects (status);
CREATE UNIQUE INDEX uq_subjects_school_id_code ON subjects (school_id,code);
CREATE INDEX idx_rooms_tenant ON rooms (tenant_id);
CREATE INDEX idx_rooms_school ON rooms (school_id);
CREATE INDEX idx_rooms_status ON rooms (status);
CREATE INDEX idx_admission_enquiries_tenant ON admission_enquiries (tenant_id);
CREATE INDEX idx_admission_enquiries_school ON admission_enquiries (school_id);
CREATE INDEX idx_enquiry_followups_tenant ON enquiry_followups (tenant_id);
CREATE INDEX idx_enquiry_followups_school ON enquiry_followups (school_id);
CREATE INDEX idx_admission_applications_tenant ON admission_applications (tenant_id);
CREATE INDEX idx_admission_applications_school ON admission_applications (school_id);
CREATE INDEX idx_admission_applications_status ON admission_applications (status);
CREATE UNIQUE INDEX uq_admission_applications_school_id_application_no ON admission_applications (school_id,application_no);
CREATE INDEX idx_application_documents_tenant ON application_documents (tenant_id);
CREATE INDEX idx_application_documents_school ON application_documents (school_id);
CREATE INDEX idx_application_documents_status ON application_documents (status);
CREATE INDEX idx_admission_assessments_tenant ON admission_assessments (tenant_id);
CREATE INDEX idx_admission_assessments_school ON admission_assessments (school_id);
CREATE INDEX idx_admission_decisions_tenant ON admission_decisions (tenant_id);
CREATE INDEX idx_admission_decisions_school ON admission_decisions (school_id);
CREATE INDEX idx_admission_status_history_tenant ON admission_status_history (tenant_id);
CREATE INDEX idx_admission_status_history_school ON admission_status_history (school_id);
CREATE INDEX idx_students_tenant ON students (tenant_id);
CREATE INDEX idx_students_school ON students (school_id);
CREATE INDEX idx_students_status ON students (status);
CREATE UNIQUE INDEX uq_students_school_id_admission_no ON students (school_id,admission_no);
CREATE INDEX idx_student_enrollments_tenant ON student_enrollments (tenant_id);
CREATE INDEX idx_student_enrollments_school ON student_enrollments (school_id);
CREATE INDEX idx_student_enrollments_status ON student_enrollments (status);
CREATE INDEX idx_student_status_history_tenant ON student_status_history (tenant_id);
CREATE INDEX idx_student_status_history_school ON student_status_history (school_id);
CREATE INDEX idx_guardians_tenant ON guardians (tenant_id);
CREATE INDEX idx_guardians_school ON guardians (school_id);
CREATE INDEX idx_student_guardians_tenant ON student_guardians (tenant_id);
CREATE INDEX idx_student_guardians_school ON student_guardians (school_id);
CREATE INDEX idx_guardian_preferences_tenant ON guardian_preferences (tenant_id);
CREATE INDEX idx_guardian_preferences_school ON guardian_preferences (school_id);
CREATE INDEX idx_guardian_preferences_status ON guardian_preferences (status);
CREATE INDEX idx_student_contacts_tenant ON student_contacts (tenant_id);
CREATE INDEX idx_student_contacts_school ON student_contacts (school_id);
CREATE INDEX idx_student_contacts_status ON student_contacts (status);
CREATE INDEX idx_student_notes_tenant ON student_notes (tenant_id);
CREATE INDEX idx_student_notes_school ON student_notes (school_id);
CREATE INDEX idx_student_notes_status ON student_notes (status);
CREATE INDEX idx_student_tags_tenant ON student_tags (tenant_id);
CREATE INDEX idx_student_tags_school ON student_tags (school_id);
CREATE INDEX idx_student_tags_status ON student_tags (status);
CREATE INDEX idx_alumni_profiles_tenant ON alumni_profiles (tenant_id);
CREATE INDEX idx_alumni_profiles_school ON alumni_profiles (school_id);
CREATE INDEX idx_alumni_profiles_status ON alumni_profiles (status);
CREATE INDEX idx_employees_tenant ON employees (tenant_id);
CREATE INDEX idx_employees_school ON employees (school_id);
CREATE INDEX idx_employees_status ON employees (status);
CREATE UNIQUE INDEX uq_employees_school_id_employee_no ON employees (school_id,employee_no);
CREATE INDEX idx_employment_history_tenant ON employment_history (tenant_id);
CREATE INDEX idx_employment_history_school ON employment_history (school_id);
CREATE INDEX idx_teacher_assignments_tenant ON teacher_assignments (tenant_id);
CREATE INDEX idx_teacher_assignments_school ON teacher_assignments (school_id);
CREATE INDEX idx_teacher_assignments_status ON teacher_assignments (status);
CREATE INDEX idx_employee_qualifications_tenant ON employee_qualifications (tenant_id);
CREATE INDEX idx_employee_qualifications_school ON employee_qualifications (school_id);
CREATE INDEX idx_employee_qualifications_status ON employee_qualifications (status);
CREATE INDEX idx_employee_documents_tenant ON employee_documents (tenant_id);
CREATE INDEX idx_employee_documents_school ON employee_documents (school_id);
CREATE INDEX idx_employee_documents_status ON employee_documents (status);
CREATE INDEX idx_employee_emergency_contacts_tenant ON employee_emergency_contacts (tenant_id);
CREATE INDEX idx_employee_emergency_contacts_school ON employee_emergency_contacts (school_id);
CREATE INDEX idx_employee_emergency_contacts_status ON employee_emergency_contacts (status);
CREATE INDEX idx_employee_bank_accounts_tenant ON employee_bank_accounts (tenant_id);
CREATE INDEX idx_employee_bank_accounts_school ON employee_bank_accounts (school_id);
CREATE INDEX idx_staff_notes_tenant ON staff_notes (tenant_id);
CREATE INDEX idx_staff_notes_school ON staff_notes (school_id);
CREATE INDEX idx_staff_notes_status ON staff_notes (status);
CREATE INDEX idx_curricula_tenant ON curricula (tenant_id);
CREATE INDEX idx_curricula_school ON curricula (school_id);
CREATE INDEX idx_curricula_status ON curricula (status);
CREATE INDEX idx_curriculum_units_tenant ON curriculum_units (tenant_id);
CREATE INDEX idx_curriculum_units_school ON curriculum_units (school_id);
CREATE INDEX idx_curriculum_units_status ON curriculum_units (status);
CREATE INDEX idx_learning_outcomes_tenant ON learning_outcomes (tenant_id);
CREATE INDEX idx_learning_outcomes_school ON learning_outcomes (school_id);
CREATE INDEX idx_learning_outcomes_status ON learning_outcomes (status);
CREATE INDEX idx_lesson_plans_tenant ON lesson_plans (tenant_id);
CREATE INDEX idx_lesson_plans_school ON lesson_plans (school_id);
CREATE INDEX idx_lesson_plans_status ON lesson_plans (status);
CREATE INDEX idx_lesson_plan_resources_tenant ON lesson_plan_resources (tenant_id);
CREATE INDEX idx_lesson_plan_resources_school ON lesson_plan_resources (school_id);
CREATE INDEX idx_lesson_plan_resources_status ON lesson_plan_resources (status);
CREATE INDEX idx_lesson_plan_reviews_tenant ON lesson_plan_reviews (tenant_id);
CREATE INDEX idx_lesson_plan_reviews_school ON lesson_plan_reviews (school_id);
CREATE INDEX idx_syllabus_progress_tenant ON syllabus_progress (tenant_id);
CREATE INDEX idx_syllabus_progress_school ON syllabus_progress (school_id);
CREATE INDEX idx_syllabus_progress_status ON syllabus_progress (status);
CREATE INDEX idx_academic_calendar_events_tenant ON academic_calendar_events (tenant_id);
CREATE INDEX idx_academic_calendar_events_school ON academic_calendar_events (school_id);
CREATE INDEX idx_academic_calendar_events_status ON academic_calendar_events (status);
CREATE INDEX idx_teaching_resources_tenant ON teaching_resources (tenant_id);
CREATE INDEX idx_teaching_resources_school ON teaching_resources (school_id);
CREATE INDEX idx_teaching_resources_status ON teaching_resources (status);
CREATE INDEX idx_academic_policies_tenant ON academic_policies (tenant_id);
CREATE INDEX idx_academic_policies_school ON academic_policies (school_id);
CREATE INDEX idx_academic_policies_status ON academic_policies (status);
CREATE INDEX idx_attendance_sessions_tenant ON attendance_sessions (tenant_id);
CREATE INDEX idx_attendance_sessions_school ON attendance_sessions (school_id);
CREATE INDEX idx_attendance_sessions_status ON attendance_sessions (status);
CREATE INDEX idx_attendance_sessions_attendance_date ON attendance_sessions (attendance_date);
CREATE INDEX idx_student_attendance_tenant ON student_attendance (tenant_id);
CREATE INDEX idx_student_attendance_school ON student_attendance (school_id);
CREATE INDEX idx_attendance_corrections_tenant ON attendance_corrections (tenant_id);
CREATE INDEX idx_attendance_corrections_school ON attendance_corrections (school_id);
CREATE INDEX idx_student_leave_requests_tenant ON student_leave_requests (tenant_id);
CREATE INDEX idx_student_leave_requests_school ON student_leave_requests (school_id);
CREATE INDEX idx_student_leave_requests_status ON student_leave_requests (status);
CREATE INDEX idx_student_leave_approvals_tenant ON student_leave_approvals (tenant_id);
CREATE INDEX idx_student_leave_approvals_school ON student_leave_approvals (school_id);
CREATE INDEX idx_attendance_policies_tenant ON attendance_policies (tenant_id);
CREATE INDEX idx_attendance_policies_school ON attendance_policies (school_id);
CREATE INDEX idx_attendance_policies_status ON attendance_policies (status);
CREATE INDEX idx_period_definitions_tenant ON period_definitions (tenant_id);
CREATE INDEX idx_period_definitions_school ON period_definitions (school_id);
CREATE INDEX idx_period_definitions_status ON period_definitions (status);
CREATE INDEX idx_timetables_tenant ON timetables (tenant_id);
CREATE INDEX idx_timetables_school ON timetables (school_id);
CREATE INDEX idx_timetables_status ON timetables (status);
CREATE INDEX idx_timetable_slots_tenant ON timetable_slots (tenant_id);
CREATE INDEX idx_timetable_slots_school ON timetable_slots (school_id);
CREATE INDEX idx_timetable_slots_status ON timetable_slots (status);
CREATE INDEX idx_teacher_availability_tenant ON teacher_availability (tenant_id);
CREATE INDEX idx_teacher_availability_school ON teacher_availability (school_id);
CREATE INDEX idx_teacher_availability_status ON teacher_availability (status);
CREATE INDEX idx_substitutions_tenant ON substitutions (tenant_id);
CREATE INDEX idx_substitutions_school ON substitutions (school_id);
CREATE INDEX idx_substitutions_status ON substitutions (status);
CREATE INDEX idx_schedule_conflicts_tenant ON schedule_conflicts (tenant_id);
CREATE INDEX idx_schedule_conflicts_school ON schedule_conflicts (school_id);
CREATE INDEX idx_schedule_conflicts_event_at ON schedule_conflicts (event_at);
CREATE INDEX idx_learning_tasks_tenant ON learning_tasks (tenant_id);
CREATE INDEX idx_learning_tasks_school ON learning_tasks (school_id);
CREATE INDEX idx_learning_tasks_status ON learning_tasks (status);
CREATE INDEX idx_task_attachments_tenant ON task_attachments (tenant_id);
CREATE INDEX idx_task_attachments_school ON task_attachments (school_id);
CREATE INDEX idx_task_attachments_status ON task_attachments (status);
CREATE INDEX idx_task_submissions_tenant ON task_submissions (tenant_id);
CREATE INDEX idx_task_submissions_school ON task_submissions (school_id);
CREATE INDEX idx_task_submissions_status ON task_submissions (status);
CREATE INDEX idx_submission_attachments_tenant ON submission_attachments (tenant_id);
CREATE INDEX idx_submission_attachments_school ON submission_attachments (school_id);
CREATE INDEX idx_submission_attachments_status ON submission_attachments (status);
CREATE INDEX idx_task_evaluations_tenant ON task_evaluations (tenant_id);
CREATE INDEX idx_task_evaluations_school ON task_evaluations (school_id);
CREATE INDEX idx_task_evaluations_status ON task_evaluations (status);
CREATE INDEX idx_rubrics_tenant ON rubrics (tenant_id);
CREATE INDEX idx_rubrics_school ON rubrics (school_id);
CREATE INDEX idx_rubrics_status ON rubrics (status);
CREATE INDEX idx_exam_types_tenant ON exam_types (tenant_id);
CREATE INDEX idx_exam_types_school ON exam_types (school_id);
CREATE INDEX idx_exam_types_status ON exam_types (status);
CREATE INDEX idx_exams_tenant ON exams (tenant_id);
CREATE INDEX idx_exams_school ON exams (school_id);
CREATE INDEX idx_exams_status ON exams (status);
CREATE INDEX idx_exam_components_tenant ON exam_components (tenant_id);
CREATE INDEX idx_exam_components_school ON exam_components (school_id);
CREATE INDEX idx_exam_components_status ON exam_components (status);
CREATE INDEX idx_exam_schedules_tenant ON exam_schedules (tenant_id);
CREATE INDEX idx_exam_schedules_school ON exam_schedules (school_id);
CREATE INDEX idx_exam_schedules_exam_date ON exam_schedules (exam_date);
CREATE INDEX idx_exam_invigilators_tenant ON exam_invigilators (tenant_id);
CREATE INDEX idx_exam_invigilators_school ON exam_invigilators (school_id);
CREATE INDEX idx_exam_invigilators_status ON exam_invigilators (status);
CREATE INDEX idx_mark_entries_tenant ON mark_entries (tenant_id);
CREATE INDEX idx_mark_entries_school ON mark_entries (school_id);
CREATE INDEX idx_mark_verifications_tenant ON mark_verifications (tenant_id);
CREATE INDEX idx_mark_verifications_school ON mark_verifications (school_id);
CREATE INDEX idx_grade_scales_tenant ON grade_scales (tenant_id);
CREATE INDEX idx_grade_scales_school ON grade_scales (school_id);
CREATE INDEX idx_grade_scales_status ON grade_scales (status);
CREATE INDEX idx_results_tenant ON results (tenant_id);
CREATE INDEX idx_results_school ON results (school_id);
CREATE INDEX idx_report_cards_tenant ON report_cards (tenant_id);
CREATE INDEX idx_report_cards_school ON report_cards (school_id);
CREATE INDEX idx_report_cards_status ON report_cards (status);
CREATE INDEX idx_fee_heads_tenant ON fee_heads (tenant_id);
CREATE INDEX idx_fee_heads_school ON fee_heads (school_id);
CREATE INDEX idx_fee_heads_status ON fee_heads (status);
CREATE INDEX idx_fee_structures_tenant ON fee_structures (tenant_id);
CREATE INDEX idx_fee_structures_school ON fee_structures (school_id);
CREATE INDEX idx_fee_structures_status ON fee_structures (status);
CREATE INDEX idx_fee_structure_items_tenant ON fee_structure_items (tenant_id);
CREATE INDEX idx_fee_structure_items_school ON fee_structure_items (school_id);
CREATE INDEX idx_fee_structure_items_status ON fee_structure_items (status);
CREATE INDEX idx_student_fee_assignments_tenant ON student_fee_assignments (tenant_id);
CREATE INDEX idx_student_fee_assignments_school ON student_fee_assignments (school_id);
CREATE INDEX idx_student_fee_assignments_status ON student_fee_assignments (status);
CREATE INDEX idx_student_fee_charges_tenant ON student_fee_charges (tenant_id);
CREATE INDEX idx_student_fee_charges_school ON student_fee_charges (school_id);
CREATE INDEX idx_student_fee_charges_status ON student_fee_charges (status);
CREATE INDEX idx_student_fee_charges_due_date ON student_fee_charges (due_date);
CREATE INDEX idx_concessions_tenant ON concessions (tenant_id);
CREATE INDEX idx_concessions_school ON concessions (school_id);
CREATE INDEX idx_concessions_status ON concessions (status);
CREATE INDEX idx_concessions_transaction_date ON concessions (transaction_date);
CREATE INDEX idx_fine_rules_tenant ON fine_rules (tenant_id);
CREATE INDEX idx_fine_rules_school ON fine_rules (school_id);
CREATE INDEX idx_fine_rules_status ON fine_rules (status);
CREATE INDEX idx_fines_tenant ON fines (tenant_id);
CREATE INDEX idx_fines_school ON fines (school_id);
CREATE INDEX idx_fines_status ON fines (status);
CREATE INDEX idx_fines_transaction_date ON fines (transaction_date);
CREATE INDEX idx_payments_tenant ON payments (tenant_id);
CREATE INDEX idx_payments_school ON payments (school_id);
CREATE UNIQUE INDEX uq_payments_tenant_id_provider_reference ON payments (tenant_id,provider_reference);
CREATE INDEX idx_payment_allocations_tenant ON payment_allocations (tenant_id);
CREATE INDEX idx_payment_allocations_school ON payment_allocations (school_id);
CREATE INDEX idx_payment_allocations_status ON payment_allocations (status);
CREATE INDEX idx_payment_allocations_transaction_date ON payment_allocations (transaction_date);
CREATE INDEX idx_receipts_tenant ON receipts (tenant_id);
CREATE INDEX idx_receipts_school ON receipts (school_id);
CREATE INDEX idx_receipts_status ON receipts (status);
CREATE UNIQUE INDEX uq_receipts_school_id_receipt_no ON receipts (school_id,receipt_no);
CREATE INDEX idx_refunds_tenant ON refunds (tenant_id);
CREATE INDEX idx_refunds_school ON refunds (school_id);
CREATE INDEX idx_refunds_status ON refunds (status);
CREATE INDEX idx_finance_accounts_tenant ON finance_accounts (tenant_id);
CREATE INDEX idx_finance_accounts_school ON finance_accounts (school_id);
CREATE INDEX idx_finance_accounts_status ON finance_accounts (status);
CREATE INDEX idx_finance_transactions_tenant ON finance_transactions (tenant_id);
CREATE INDEX idx_finance_transactions_school ON finance_transactions (school_id);
CREATE INDEX idx_finance_transactions_status ON finance_transactions (status);
CREATE INDEX idx_finance_transactions_transaction_date ON finance_transactions (transaction_date);
CREATE INDEX idx_vendors_tenant ON vendors (tenant_id);
CREATE INDEX idx_vendors_school ON vendors (school_id);
CREATE INDEX idx_vendors_status ON vendors (status);
CREATE INDEX idx_job_openings_tenant ON job_openings (tenant_id);
CREATE INDEX idx_job_openings_school ON job_openings (school_id);
CREATE INDEX idx_job_openings_status ON job_openings (status);
CREATE INDEX idx_candidates_tenant ON candidates (tenant_id);
CREATE INDEX idx_candidates_school ON candidates (school_id);
CREATE INDEX idx_candidates_status ON candidates (status);
CREATE INDEX idx_candidate_applications_tenant ON candidate_applications (tenant_id);
CREATE INDEX idx_candidate_applications_school ON candidate_applications (school_id);
CREATE INDEX idx_candidate_applications_status ON candidate_applications (status);
CREATE INDEX idx_interview_schedules_tenant ON interview_schedules (tenant_id);
CREATE INDEX idx_interview_schedules_school ON interview_schedules (school_id);
CREATE INDEX idx_interview_schedules_status ON interview_schedules (status);
CREATE INDEX idx_offers_tenant ON offers (tenant_id);
CREATE INDEX idx_offers_school ON offers (school_id);
CREATE INDEX idx_offers_status ON offers (status);
CREATE INDEX idx_leave_types_tenant ON leave_types (tenant_id);
CREATE INDEX idx_leave_types_school ON leave_types (school_id);
CREATE INDEX idx_leave_types_status ON leave_types (status);
CREATE INDEX idx_leave_policies_tenant ON leave_policies (tenant_id);
CREATE INDEX idx_leave_policies_school ON leave_policies (school_id);
CREATE INDEX idx_leave_policies_status ON leave_policies (status);
CREATE INDEX idx_leave_balances_tenant ON leave_balances (tenant_id);
CREATE INDEX idx_leave_balances_school ON leave_balances (school_id);
CREATE INDEX idx_leave_balances_status ON leave_balances (status);
CREATE INDEX idx_leave_requests_tenant ON leave_requests (tenant_id);
CREATE INDEX idx_leave_requests_school ON leave_requests (school_id);
CREATE INDEX idx_leave_requests_status ON leave_requests (status);
CREATE INDEX idx_payroll_runs_tenant ON payroll_runs (tenant_id);
CREATE INDEX idx_payroll_runs_school ON payroll_runs (school_id);
CREATE INDEX idx_payroll_runs_status ON payroll_runs (status);
CREATE INDEX idx_vehicles_tenant ON vehicles (tenant_id);
CREATE INDEX idx_vehicles_school ON vehicles (school_id);
CREATE INDEX idx_vehicles_status ON vehicles (status);
CREATE UNIQUE INDEX uq_vehicles_school_id_registration_no ON vehicles (school_id,registration_no);
CREATE INDEX idx_vehicle_documents_tenant ON vehicle_documents (tenant_id);
CREATE INDEX idx_vehicle_documents_school ON vehicle_documents (school_id);
CREATE INDEX idx_vehicle_documents_status ON vehicle_documents (status);
CREATE INDEX idx_vehicle_maintenance_tenant ON vehicle_maintenance (tenant_id);
CREATE INDEX idx_vehicle_maintenance_school ON vehicle_maintenance (school_id);
CREATE INDEX idx_vehicle_maintenance_status ON vehicle_maintenance (status);
CREATE INDEX idx_fuel_logs_tenant ON fuel_logs (tenant_id);
CREATE INDEX idx_fuel_logs_school ON fuel_logs (school_id);
CREATE INDEX idx_fuel_logs_status ON fuel_logs (status);
CREATE INDEX idx_transport_routes_tenant ON transport_routes (tenant_id);
CREATE INDEX idx_transport_routes_school ON transport_routes (school_id);
CREATE INDEX idx_transport_routes_status ON transport_routes (status);
CREATE INDEX idx_transport_stops_tenant ON transport_stops (tenant_id);
CREATE INDEX idx_transport_stops_school ON transport_stops (school_id);
CREATE INDEX idx_transport_stops_status ON transport_stops (status);
CREATE INDEX idx_route_stops_tenant ON route_stops (tenant_id);
CREATE INDEX idx_route_stops_school ON route_stops (school_id);
CREATE INDEX idx_route_stops_status ON route_stops (status);
CREATE INDEX idx_transport_assignments_tenant ON transport_assignments (tenant_id);
CREATE INDEX idx_transport_assignments_school ON transport_assignments (school_id);
CREATE INDEX idx_transport_assignments_status ON transport_assignments (status);
CREATE INDEX idx_trips_tenant ON trips (tenant_id);
CREATE INDEX idx_trips_school ON trips (school_id);
CREATE INDEX idx_trips_status ON trips (status);
CREATE INDEX idx_trips_trip_date ON trips (trip_date);
CREATE INDEX idx_trip_events_tenant ON trip_events (tenant_id);
CREATE INDEX idx_trip_events_school ON trip_events (school_id);
CREATE INDEX idx_trip_events_status ON trip_events (status);
CREATE INDEX idx_book_titles_tenant ON book_titles (tenant_id);
CREATE INDEX idx_book_titles_school ON book_titles (school_id);
CREATE INDEX idx_book_titles_status ON book_titles (status);
CREATE INDEX idx_book_copies_tenant ON book_copies (tenant_id);
CREATE INDEX idx_book_copies_school ON book_copies (school_id);
CREATE UNIQUE INDEX uq_book_copies_school_id_barcode ON book_copies (school_id,barcode);
CREATE INDEX idx_library_memberships_tenant ON library_memberships (tenant_id);
CREATE INDEX idx_library_memberships_school ON library_memberships (school_id);
CREATE INDEX idx_library_memberships_status ON library_memberships (status);
CREATE INDEX idx_circulation_transactions_tenant ON circulation_transactions (tenant_id);
CREATE INDEX idx_circulation_transactions_school ON circulation_transactions (school_id);
CREATE INDEX idx_circulation_transactions_status ON circulation_transactions (status);
CREATE INDEX idx_reservations_tenant ON reservations (tenant_id);
CREATE INDEX idx_reservations_school ON reservations (school_id);
CREATE INDEX idx_reservations_status ON reservations (status);
CREATE INDEX idx_library_fines_tenant ON library_fines (tenant_id);
CREATE INDEX idx_library_fines_school ON library_fines (school_id);
CREATE INDEX idx_library_fines_status ON library_fines (status);
CREATE INDEX idx_library_fines_transaction_date ON library_fines (transaction_date);
CREATE INDEX idx_digital_resources_tenant ON digital_resources (tenant_id);
CREATE INDEX idx_digital_resources_school ON digital_resources (school_id);
CREATE INDEX idx_digital_resources_status ON digital_resources (status);
CREATE INDEX idx_library_access_logs_tenant ON library_access_logs (tenant_id);
CREATE INDEX idx_library_access_logs_school ON library_access_logs (school_id);
CREATE INDEX idx_library_access_logs_event_at ON library_access_logs (event_at);
CREATE INDEX idx_hostels_tenant ON hostels (tenant_id);
CREATE INDEX idx_hostels_school ON hostels (school_id);
CREATE INDEX idx_hostels_status ON hostels (status);
CREATE INDEX idx_hostel_rooms_tenant ON hostel_rooms (tenant_id);
CREATE INDEX idx_hostel_rooms_school ON hostel_rooms (school_id);
CREATE INDEX idx_hostel_rooms_status ON hostel_rooms (status);
CREATE INDEX idx_hostel_beds_tenant ON hostel_beds (tenant_id);
CREATE INDEX idx_hostel_beds_school ON hostel_beds (school_id);
CREATE INDEX idx_hostel_beds_status ON hostel_beds (status);
CREATE INDEX idx_hostel_allocations_tenant ON hostel_allocations (tenant_id);
CREATE INDEX idx_hostel_allocations_school ON hostel_allocations (school_id);
CREATE INDEX idx_hostel_allocations_status ON hostel_allocations (status);
CREATE INDEX idx_hostel_attendance_tenant ON hostel_attendance (tenant_id);
CREATE INDEX idx_hostel_attendance_school ON hostel_attendance (school_id);
CREATE INDEX idx_hostel_attendance_status ON hostel_attendance (status);
CREATE INDEX idx_outing_requests_tenant ON outing_requests (tenant_id);
CREATE INDEX idx_outing_requests_school ON outing_requests (school_id);
CREATE INDEX idx_outing_requests_status ON outing_requests (status);
CREATE INDEX idx_hostel_complaints_tenant ON hostel_complaints (tenant_id);
CREATE INDEX idx_hostel_complaints_school ON hostel_complaints (school_id);
CREATE INDEX idx_hostel_complaints_status ON hostel_complaints (status);
CREATE INDEX idx_medical_profiles_tenant ON medical_profiles (tenant_id);
CREATE INDEX idx_medical_profiles_school ON medical_profiles (school_id);
CREATE INDEX idx_allergies_tenant ON allergies (tenant_id);
CREATE INDEX idx_allergies_school ON allergies (school_id);
CREATE INDEX idx_medications_tenant ON medications (tenant_id);
CREATE INDEX idx_medications_school ON medications (school_id);
CREATE INDEX idx_clinic_visits_tenant ON clinic_visits (tenant_id);
CREATE INDEX idx_clinic_visits_school ON clinic_visits (school_id);
CREATE INDEX idx_counselling_cases_tenant ON counselling_cases (tenant_id);
CREATE INDEX idx_counselling_cases_school ON counselling_cases (school_id);
CREATE INDEX idx_counselling_sessions_tenant ON counselling_sessions (tenant_id);
CREATE INDEX idx_counselling_sessions_school ON counselling_sessions (school_id);
CREATE INDEX idx_discipline_incidents_tenant ON discipline_incidents (tenant_id);
CREATE INDEX idx_discipline_incidents_school ON discipline_incidents (school_id);
CREATE INDEX idx_discipline_incidents_status ON discipline_incidents (status);
CREATE INDEX idx_discipline_actions_tenant ON discipline_actions (tenant_id);
CREATE INDEX idx_discipline_actions_school ON discipline_actions (school_id);
CREATE INDEX idx_visitors_tenant ON visitors (tenant_id);
CREATE INDEX idx_visitors_school ON visitors (school_id);
CREATE INDEX idx_visits_tenant ON visits (tenant_id);
CREATE INDEX idx_visits_school ON visits (school_id);
CREATE INDEX idx_visits_status ON visits (status);
CREATE INDEX idx_visitor_approvals_tenant ON visitor_approvals (tenant_id);
CREATE INDEX idx_visitor_approvals_school ON visitor_approvals (school_id);
CREATE INDEX idx_visitor_passes_tenant ON visitor_passes (tenant_id);
CREATE INDEX idx_visitor_passes_school ON visitor_passes (school_id);
CREATE INDEX idx_visitor_passes_status ON visitor_passes (status);
CREATE INDEX idx_gate_events_tenant ON gate_events (tenant_id);
CREATE INDEX idx_gate_events_school ON gate_events (school_id);
CREATE INDEX idx_gate_events_event_at ON gate_events (event_at);
CREATE INDEX idx_security_incidents_tenant ON security_incidents (tenant_id);
CREATE INDEX idx_security_incidents_school ON security_incidents (school_id);
CREATE INDEX idx_security_incidents_event_at ON security_incidents (event_at);
CREATE INDEX idx_suppliers_tenant ON suppliers (tenant_id);
CREATE INDEX idx_suppliers_school ON suppliers (school_id);
CREATE INDEX idx_suppliers_status ON suppliers (status);
CREATE INDEX idx_inventory_items_tenant ON inventory_items (tenant_id);
CREATE INDEX idx_inventory_items_school ON inventory_items (school_id);
CREATE INDEX idx_inventory_items_status ON inventory_items (status);
CREATE UNIQUE INDEX uq_inventory_items_school_id_sku ON inventory_items (school_id,sku);
CREATE INDEX idx_inventory_locations_tenant ON inventory_locations (tenant_id);
CREATE INDEX idx_inventory_locations_school ON inventory_locations (school_id);
CREATE INDEX idx_inventory_locations_status ON inventory_locations (status);
CREATE INDEX idx_stock_transactions_tenant ON stock_transactions (tenant_id);
CREATE INDEX idx_stock_transactions_school ON stock_transactions (school_id);
CREATE INDEX idx_assets_tenant ON assets (tenant_id);
CREATE INDEX idx_assets_school ON assets (school_id);
CREATE UNIQUE INDEX uq_assets_school_id_asset_tag ON assets (school_id,asset_tag);
CREATE INDEX idx_asset_assignments_tenant ON asset_assignments (tenant_id);
CREATE INDEX idx_asset_assignments_school ON asset_assignments (school_id);
CREATE INDEX idx_asset_assignments_status ON asset_assignments (status);
CREATE INDEX idx_asset_maintenance_tenant ON asset_maintenance (tenant_id);
CREATE INDEX idx_asset_maintenance_school ON asset_maintenance (school_id);
CREATE INDEX idx_asset_maintenance_status ON asset_maintenance (status);
CREATE INDEX idx_labs_tenant ON labs (tenant_id);
CREATE INDEX idx_labs_school ON labs (school_id);
CREATE INDEX idx_labs_status ON labs (status);
CREATE INDEX idx_lab_bookings_tenant ON lab_bookings (tenant_id);
CREATE INDEX idx_lab_bookings_school ON lab_bookings (school_id);
CREATE INDEX idx_lab_bookings_status ON lab_bookings (status);
CREATE INDEX idx_events_tenant ON events (tenant_id);
CREATE INDEX idx_events_school ON events (school_id);
CREATE INDEX idx_events_status ON events (status);
CREATE INDEX idx_event_participants_tenant ON event_participants (tenant_id);
CREATE INDEX idx_event_participants_school ON event_participants (school_id);
CREATE INDEX idx_event_participants_status ON event_participants (status);
CREATE INDEX idx_consent_requests_tenant ON consent_requests (tenant_id);
CREATE INDEX idx_consent_requests_school ON consent_requests (school_id);
CREATE INDEX idx_ptm_schedules_tenant ON ptm_schedules (tenant_id);
CREATE INDEX idx_ptm_schedules_school ON ptm_schedules (school_id);
CREATE INDEX idx_ptm_schedules_status ON ptm_schedules (status);
CREATE INDEX idx_ptm_slots_tenant ON ptm_slots (tenant_id);
CREATE INDEX idx_ptm_slots_school ON ptm_slots (school_id);
CREATE INDEX idx_ptm_slots_status ON ptm_slots (status);
CREATE INDEX idx_announcements_tenant ON announcements (tenant_id);
CREATE INDEX idx_announcements_school ON announcements (school_id);
CREATE INDEX idx_announcements_status ON announcements (status);
CREATE INDEX idx_message_threads_tenant ON message_threads (tenant_id);
CREATE INDEX idx_message_threads_school ON message_threads (school_id);
CREATE INDEX idx_message_threads_status ON message_threads (status);
CREATE INDEX idx_messages_tenant ON messages (tenant_id);
CREATE INDEX idx_messages_school ON messages (school_id);
CREATE INDEX idx_messages_sent_at ON messages (sent_at);
CREATE INDEX idx_documents_tenant ON documents (tenant_id);
CREATE INDEX idx_documents_school ON documents (school_id);
CREATE INDEX idx_documents_status ON documents (status);
CREATE INDEX idx_document_verifications_tenant ON document_verifications (tenant_id);
CREATE INDEX idx_document_verifications_school ON document_verifications (school_id);
CREATE INDEX idx_certificate_templates_tenant ON certificate_templates (tenant_id);
CREATE INDEX idx_certificate_templates_school ON certificate_templates (school_id);
CREATE INDEX idx_certificate_templates_status ON certificate_templates (status);
CREATE INDEX idx_certificate_sequences_tenant ON certificate_sequences (tenant_id);
CREATE INDEX idx_certificate_sequences_school ON certificate_sequences (school_id);
CREATE INDEX idx_certificate_sequences_status ON certificate_sequences (status);
CREATE INDEX idx_certificate_issues_tenant ON certificate_issues (tenant_id);
CREATE INDEX idx_certificate_issues_school ON certificate_issues (school_id);
CREATE INDEX idx_certificate_issues_status ON certificate_issues (status);
CREATE UNIQUE INDEX uq_certificate_issues_school_id_certificate_no ON certificate_issues (school_id,certificate_no);
CREATE INDEX idx_transfer_certificates_tenant ON transfer_certificates (tenant_id);
CREATE INDEX idx_transfer_certificates_school ON transfer_certificates (school_id);
CREATE INDEX idx_transfer_certificates_status ON transfer_certificates (status);
CREATE INDEX idx_metric_definitions_tenant ON metric_definitions (tenant_id);
CREATE INDEX idx_metric_definitions_school ON metric_definitions (school_id);
CREATE INDEX idx_metric_definitions_status ON metric_definitions (status);
CREATE INDEX idx_report_definitions_tenant ON report_definitions (tenant_id);
CREATE INDEX idx_report_definitions_school ON report_definitions (school_id);
CREATE INDEX idx_report_definitions_status ON report_definitions (status);
CREATE INDEX idx_saved_reports_tenant ON saved_reports (tenant_id);
CREATE INDEX idx_saved_reports_school ON saved_reports (school_id);
CREATE INDEX idx_saved_reports_status ON saved_reports (status);
CREATE INDEX idx_export_jobs_tenant ON export_jobs (tenant_id);
CREATE INDEX idx_export_jobs_school ON export_jobs (school_id);
CREATE INDEX idx_export_jobs_status ON export_jobs (status);
CREATE INDEX idx_custom_fields_tenant ON custom_fields (tenant_id);
CREATE INDEX idx_custom_fields_school ON custom_fields (school_id);
CREATE INDEX idx_custom_fields_status ON custom_fields (status);
CREATE INDEX idx_system_settings_tenant ON system_settings (tenant_id);
CREATE INDEX idx_system_settings_school ON system_settings (school_id);
CREATE INDEX idx_system_settings_status ON system_settings (status);
CREATE INDEX idx_integration_configs_tenant ON integration_configs (tenant_id);
CREATE INDEX idx_integration_configs_school ON integration_configs (school_id);
CREATE INDEX idx_integration_configs_status ON integration_configs (status);
CREATE INDEX idx_webhook_deliveries_tenant ON webhook_deliveries (tenant_id);
CREATE INDEX idx_webhook_deliveries_school ON webhook_deliveries (school_id);
CREATE INDEX idx_webhook_deliveries_event_at ON webhook_deliveries (event_at);
CREATE INDEX idx_audit_events_tenant ON audit_events (tenant_id);
CREATE INDEX idx_audit_events_school ON audit_events (school_id);
CREATE INDEX idx_audit_events_event_at ON audit_events (event_at);
CREATE INDEX idx_import_jobs_tenant ON import_jobs (tenant_id);
CREATE INDEX idx_import_jobs_school ON import_jobs (school_id);
CREATE INDEX idx_import_jobs_status ON import_jobs (status);