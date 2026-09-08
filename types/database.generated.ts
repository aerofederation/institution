/**
 * AUTO-GENERATED — do not edit by hand.
 *
 * Regenerate with:
 *   npm run db:types        (Supabase CLI, against the linked project — canonical)
 *   npm run db:types:local  (from supabase/migrations, no credentials needed)
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

// ── Enums ──────────────────────────────────────────────────────────────────

export type AcademicYearStatus =
  | 'UPCOMING'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'ARCHIVED'

export type ApplicationStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'DOCUMENTS_REQUIRED'
  | 'RESUBMISSION_REQUIRED'
  | 'APPROVED'
  | 'REJECTED'
  | 'SUSPENDED'

export type AssessmentKind =
  | 'QUIZ'
  | 'TEST'
  | 'ASSIGNMENT'
  | 'EXAM'
  | 'PRACTICE'

export type AssessmentStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'PUBLISHED'
  | 'ACTIVE'
  | 'CLOSED'
  | 'GRADING'
  | 'COMPLETED'
  | 'ARCHIVED'

export type AttemptScoring =
  | 'HIGHEST'
  | 'LATEST'
  | 'AVERAGE'
  | 'FIRST'

export type AttemptStatus =
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'GRADED'
  | 'ABANDONED'
  | 'EXPIRED'

export type AuthorityScope =
  | 'GLOBAL'
  | 'TENANT'

export type DocumentType =
  | 'REGISTRATION_CERTIFICATE'
  | 'ACCREDITATION_CERTIFICATE'
  | 'AFFILIATION_LETTER'
  | 'RECOGNITION_ORDER'
  | 'TAX_DOCUMENT'
  | 'AUTHORIZATION_LETTER'
  | 'IDENTITY_PROOF'
  | 'ADDRESS_PROOF'
  | 'INFRASTRUCTURE_PROOF'
  | 'OTHER'

export type EnrollmentStatus =
  | 'ACTIVE'
  | 'COMPLETED'
  | 'WITHDRAWN'
  | 'TRANSFERRED'
  | 'SUSPENDED'

export type InstitutionCategory =
  | 'GOVERNMENT'
  | 'PRIVATE'
  | 'AIDED'
  | 'UNAIDED'
  | 'AUTONOMOUS'
  | 'DEEMED'
  | 'PUBLIC_SECTOR'
  | 'NON_PROFIT'
  | 'OTHER'

export type InstitutionStatus =
  | 'PENDING'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'DEACTIVATED'

export type InstitutionType =
  | 'SCHOOL'
  | 'COLLEGE'
  | 'UNIVERSITY'
  | 'POLYTECHNIC'
  | 'ENGINEERING_INSTITUTION'
  | 'TRAINING_INSTITUTE'
  | 'RESEARCH_INSTITUTION'
  | 'AEROSPACE_INSTITUTION'
  | 'AVIATION_INSTITUTION'
  | 'CORPORATE_ORGANIZATION'
  | 'CORPORATE_TRAINING_ORGANIZATION'
  | 'GOVERNMENT_ORGANIZATION'
  | 'NGO'
  | 'EDUCATIONAL_ORGANIZATION'
  | 'OTHER'

export type IntegrityEvent =
  | 'TAB_HIDDEN'
  | 'TAB_VISIBLE'
  | 'WINDOW_BLUR'
  | 'WINDOW_FOCUS'
  | 'ATTEMPT_RESUMED'
  | 'SECOND_SESSION'
  | 'PASTE'
  | 'TIME_EXPIRED'

export type MaterialType =
  | 'DOCUMENT'
  | 'LINK'
  | 'NOTE'

export type NoticeAudience =
  | 'EVERYONE'
  | 'TEACHERS'
  | 'STUDENTS'

export type NotificationCategory =
  | 'ACCOUNT'
  | 'INSTITUTION'
  | 'APPLICATION'
  | 'ACADEMIC'
  | 'ASSIGNMENT'
  | 'EXAM'
  | 'RESULT'
  | 'ATTENDANCE'
  | 'CERTIFICATE'
  | 'ANNOUNCEMENT'
  | 'EVENT'
  | 'SYSTEM'

export type NotificationPriority =
  | 'LOW'
  | 'NORMAL'
  | 'HIGH'
  | 'URGENT'

export type QuestionType =
  | 'SINGLE_CHOICE'
  | 'MULTI_CHOICE'
  | 'TRUE_FALSE'
  | 'SHORT_ANSWER'
  | 'LONG_ANSWER'
  | 'FILL_BLANK'
  | 'NUMERICAL'
  | 'MATCHING'
  | 'ORDERING'
  | 'FILE_UPLOAD'
  | 'CASE_STUDY'

export type RecordStatus =
  | 'ACTIVE'
  | 'INACTIVE'
  | 'ARCHIVED'

export type ResultRelease =
  | 'IMMEDIATE'
  | 'AFTER_GRADING'
  | 'AFTER_CLOSE'
  | 'MANUAL'

export type SubmissionStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'LATE'
  | 'GRADED'
  | 'RETURNED'

export type TicketAudience =
  | 'HQ'
  | 'INSTITUTION'

export type TicketCategory =
  | 'ACCOUNT_ACCESS'
  | 'ACADEMIC'
  | 'TECHNICAL'
  | 'BILLING'
  | 'DATA_CORRECTION'
  | 'COMPLAINT'
  | 'OTHER'

export type TicketPriority =
  | 'LOW'
  | 'NORMAL'
  | 'HIGH'
  | 'URGENT'

export type TicketStatus =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'WAITING_ON_USER'
  | 'RESOLVED'
  | 'CLOSED'

export type UserStatus =
  | 'INVITED'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'DEACTIVATED'

export type VerificationStatus =
  | 'PENDING'
  | 'VERIFIED'
  | 'REJECTED'


// ── Tables ─────────────────────────────────────────────────────────────────

export type AcademicYearsRow = {
  id: string
  institution_id: string
  name: string
  starts_on: string
  ends_on: string
  is_current: boolean
  status: AcademicYearStatus
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type AcademicYearsInsert = {
  id?: string
  institution_id: string
  name: string
  starts_on: string
  ends_on: string
  is_current?: boolean
  status?: AcademicYearStatus
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
}

export type AcademicYearsUpdate = {
  id?: string
  institution_id?: string
  name?: string
  starts_on?: string
  ends_on?: string
  is_current?: boolean
  status?: AcademicYearStatus
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
}

export type AiGradeSuggestionsRow = {
  id: string
  institution_id: string
  answer_id: string
  model: string
  suggested_marks: number
  rationale: string
  rubric_points: string[]
  confidence: string | null
  requested_by: string
  input_tokens: number
  output_tokens: number
  accepted_at: string | null
  accepted_marks: number | null
  created_at: string
}

export type AiGradeSuggestionsInsert = {
  id?: string
  institution_id: string
  answer_id: string
  model: string
  suggested_marks: number
  rationale: string
  rubric_points?: string[]
  confidence?: string | null
  requested_by: string
  input_tokens?: number
  output_tokens?: number
  accepted_at?: string | null
  accepted_marks?: number | null
  created_at?: string
}

export type AiGradeSuggestionsUpdate = {
  id?: string
  institution_id?: string
  answer_id?: string
  model?: string
  suggested_marks?: number
  rationale?: string
  rubric_points?: string[]
  confidence?: string | null
  requested_by?: string
  input_tokens?: number
  output_tokens?: number
  accepted_at?: string | null
  accepted_marks?: number | null
  created_at?: string
}

export type AiUsageEventsRow = {
  id: string
  institution_id: string
  actor_id: string | null
  feature: string
  model: string
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  succeeded: boolean
  error_code: string | null
  created_at: string
}

export type AiUsageEventsInsert = {
  id?: string
  institution_id: string
  actor_id?: string | null
  feature: string
  model: string
  input_tokens?: number
  output_tokens?: number
  cache_read_tokens?: number
  succeeded?: boolean
  error_code?: string | null
  created_at?: string
}

export type AiUsageEventsUpdate = {
  id?: string
  institution_id?: string
  actor_id?: string | null
  feature?: string
  model?: string
  input_tokens?: number
  output_tokens?: number
  cache_read_tokens?: number
  succeeded?: boolean
  error_code?: string | null
  created_at?: string
}

export type ApplicationAccessTokensRow = {
  id: string
  application_id: string
  code_hash: string
  expires_at: string
  consumed_at: string | null
  attempt_count: number
  ip_hash: string | null
  created_at: string
}

export type ApplicationAccessTokensInsert = {
  id?: string
  application_id: string
  code_hash: string
  expires_at: string
  consumed_at?: string | null
  attempt_count?: number
  ip_hash?: string | null
  created_at?: string
}

export type ApplicationAccessTokensUpdate = {
  id?: string
  application_id?: string
  code_hash?: string
  expires_at?: string
  consumed_at?: string | null
  attempt_count?: number
  ip_hash?: string | null
  created_at?: string
}

export type AssessmentAnswersRow = {
  id: string
  institution_id: string
  attempt_id: string
  question_id: string
  selected_option_ids: string[]
  text_answer: string | null
  is_correct: boolean | null
  marks_awarded: number
  created_at: string
  updated_at: string
  answer_payload: Json
  storage_path: string | null
  file_name: string | null
  file_size: number | null
  mime_type: string | null
  feedback: string | null
  graded_by: string | null
  graded_at: string | null
  time_spent_ms: number | null
  suggested_marks: number | null
}

export type AssessmentAnswersInsert = {
  id?: string
  institution_id: string
  attempt_id: string
  question_id: string
  selected_option_ids?: string[]
  text_answer?: string | null
  is_correct?: boolean | null
  marks_awarded?: number
  created_at?: string
  updated_at?: string
  answer_payload?: Json
  storage_path?: string | null
  file_name?: string | null
  file_size?: number | null
  mime_type?: string | null
  feedback?: string | null
  graded_by?: string | null
  graded_at?: string | null
  time_spent_ms?: number | null
  suggested_marks?: number | null
}

export type AssessmentAnswersUpdate = {
  id?: string
  institution_id?: string
  attempt_id?: string
  question_id?: string
  selected_option_ids?: string[]
  text_answer?: string | null
  is_correct?: boolean | null
  marks_awarded?: number
  created_at?: string
  updated_at?: string
  answer_payload?: Json
  storage_path?: string | null
  file_name?: string | null
  file_size?: number | null
  mime_type?: string | null
  feedback?: string | null
  graded_by?: string | null
  graded_at?: string | null
  time_spent_ms?: number | null
  suggested_marks?: number | null
}

export type AssessmentAttemptsRow = {
  id: string
  institution_id: string
  assessment_id: string
  student_id: string
  attempt_no: number
  status: AttemptStatus
  started_at: string
  submitted_at: string | null
  expires_at: string | null
  score: number | null
  max_score: number | null
  created_at: string
  updated_at: string
  question_set: string[]
  assessment_version: number
  paused_at: string | null
  paused_ms: number
  percentage: number | null
  passed: boolean | null
  is_late: boolean
  penalty_applied: number
  released_at: string | null
  awaiting_manual: number
  marked_for_review: string[]
  last_seen_at: string | null
}

export type AssessmentAttemptsInsert = {
  id?: string
  institution_id: string
  assessment_id: string
  student_id: string
  attempt_no?: number
  status?: AttemptStatus
  started_at?: string
  submitted_at?: string | null
  expires_at?: string | null
  score?: number | null
  max_score?: number | null
  created_at?: string
  updated_at?: string
  question_set?: string[]
  assessment_version?: number
  paused_at?: string | null
  paused_ms?: number
  percentage?: number | null
  passed?: boolean | null
  is_late?: boolean
  penalty_applied?: number
  released_at?: string | null
  awaiting_manual?: number
  marked_for_review?: string[]
  last_seen_at?: string | null
}

export type AssessmentAttemptsUpdate = {
  id?: string
  institution_id?: string
  assessment_id?: string
  student_id?: string
  attempt_no?: number
  status?: AttemptStatus
  started_at?: string
  submitted_at?: string | null
  expires_at?: string | null
  score?: number | null
  max_score?: number | null
  created_at?: string
  updated_at?: string
  question_set?: string[]
  assessment_version?: number
  paused_at?: string | null
  paused_ms?: number
  percentage?: number | null
  passed?: boolean | null
  is_late?: boolean
  penalty_applied?: number
  released_at?: string | null
  awaiting_manual?: number
  marked_for_review?: string[]
  last_seen_at?: string | null
}

export type AssessmentGradeRevisionsRow = {
  id: string
  institution_id: string
  attempt_id: string
  previous_score: number | null
  new_score: number | null
  reason: string | null
  revised_by: string | null
  revised_at: string
}

export type AssessmentGradeRevisionsInsert = {
  id?: string
  institution_id: string
  attempt_id: string
  previous_score?: number | null
  new_score?: number | null
  reason?: string | null
  revised_by?: string | null
  revised_at?: string
}

export type AssessmentGradeRevisionsUpdate = {
  id?: string
  institution_id?: string
  attempt_id?: string
  previous_score?: number | null
  new_score?: number | null
  reason?: string | null
  revised_by?: string | null
  revised_at?: string
}

export type AssessmentIntegrityEventsRow = {
  id: string
  institution_id: string
  attempt_id: string
  event: IntegrityEvent
  occurred_at: string
  detail: string | null
}

export type AssessmentIntegrityEventsInsert = {
  id?: string
  institution_id: string
  attempt_id: string
  event: IntegrityEvent
  occurred_at?: string
  detail?: string | null
}

export type AssessmentIntegrityEventsUpdate = {
  id?: string
  institution_id?: string
  attempt_id?: string
  event?: IntegrityEvent
  occurred_at?: string
  detail?: string | null
}

export type AssessmentOptionsRow = {
  id: string
  institution_id: string
  question_id: string
  position: number
  label: string
  is_correct: boolean
  created_at: string
  match_label: string | null
  media_path: string | null
}

export type AssessmentOptionsInsert = {
  id?: string
  institution_id: string
  question_id: string
  position: number
  label: string
  is_correct?: boolean
  created_at?: string
  match_label?: string | null
  media_path?: string | null
}

export type AssessmentOptionsUpdate = {
  id?: string
  institution_id?: string
  question_id?: string
  position?: number
  label?: string
  is_correct?: boolean
  created_at?: string
  match_label?: string | null
  media_path?: string | null
}

export type AssessmentQuestionsRow = {
  id: string
  institution_id: string
  assessment_id: string
  position: number
  question_type: QuestionType
  prompt: string
  marks: number
  explanation: string | null
  created_at: string
  updated_at: string
  section_id: string | null
  negative_marks: number
  allow_partial_credit: boolean
  accepted_answers: string[]
  case_sensitive: boolean
  trim_whitespace: boolean
  numeric_answer: number | null
  numeric_tolerance: number | null
  numeric_unit: string | null
  allowed_mime_types: string[]
  max_file_bytes: number | null
  media_path: string | null
  media_mime_type: string | null
  passage: string | null
  difficulty: string | null
  topic: string | null
  learning_objective: string | null
  source_bank_id: string | null
  rubric: string | null
}

export type AssessmentQuestionsInsert = {
  id?: string
  institution_id: string
  assessment_id: string
  position: number
  question_type?: QuestionType
  prompt: string
  marks?: number
  explanation?: string | null
  created_at?: string
  updated_at?: string
  section_id?: string | null
  negative_marks?: number
  allow_partial_credit?: boolean
  accepted_answers?: string[]
  case_sensitive?: boolean
  trim_whitespace?: boolean
  numeric_answer?: number | null
  numeric_tolerance?: number | null
  numeric_unit?: string | null
  allowed_mime_types?: string[]
  max_file_bytes?: number | null
  media_path?: string | null
  media_mime_type?: string | null
  passage?: string | null
  difficulty?: string | null
  topic?: string | null
  learning_objective?: string | null
  source_bank_id?: string | null
  rubric?: string | null
}

export type AssessmentQuestionsUpdate = {
  id?: string
  institution_id?: string
  assessment_id?: string
  position?: number
  question_type?: QuestionType
  prompt?: string
  marks?: number
  explanation?: string | null
  created_at?: string
  updated_at?: string
  section_id?: string | null
  negative_marks?: number
  allow_partial_credit?: boolean
  accepted_answers?: string[]
  case_sensitive?: boolean
  trim_whitespace?: boolean
  numeric_answer?: number | null
  numeric_tolerance?: number | null
  numeric_unit?: string | null
  allowed_mime_types?: string[]
  max_file_bytes?: number | null
  media_path?: string | null
  media_mime_type?: string | null
  passage?: string | null
  difficulty?: string | null
  topic?: string | null
  learning_objective?: string | null
  source_bank_id?: string | null
  rubric?: string | null
}

export type AssessmentSectionsRow = {
  id: string
  institution_id: string
  assessment_id: string
  position: number
  title: string
  instructions: string | null
  created_at: string
  updated_at: string
}

export type AssessmentSectionsInsert = {
  id?: string
  institution_id: string
  assessment_id: string
  position: number
  title: string
  instructions?: string | null
  created_at?: string
  updated_at?: string
}

export type AssessmentSectionsUpdate = {
  id?: string
  institution_id?: string
  assessment_id?: string
  position?: number
  title?: string
  instructions?: string | null
  created_at?: string
  updated_at?: string
}

export type AssessmentsRow = {
  id: string
  institution_id: string
  teacher_id: string
  class_id: string
  section_id: string | null
  subject_id: string | null
  academic_year_id: string
  kind: AssessmentKind
  title: string
  instructions: string | null
  duration_minutes: number | null
  pass_marks: number | null
  max_attempts: number
  opens_at: string | null
  closes_at: string | null
  shuffle_questions: boolean
  reveal_answers: boolean
  is_published: boolean
  published_at: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  status: AssessmentStatus
  total_marks: number | null
  negative_marking: boolean
  attempt_scoring: AttemptScoring
  release_policy: ResultRelease
  results_released_at: string | null
  allow_late: boolean
  grace_minutes: number
  late_penalty_percent: number
  shuffle_options: boolean
  questions_to_serve: number | null
  allow_pause: boolean
  difficulty: string | null
  tags: string[]
  learning_objectives: string[]
  cover_path: string | null
  version: number
  archived_at: string | null
  auto_marking: boolean
}

export type AssessmentsInsert = {
  id?: string
  institution_id: string
  teacher_id: string
  class_id: string
  section_id?: string | null
  subject_id?: string | null
  academic_year_id: string
  kind?: AssessmentKind
  title: string
  instructions?: string | null
  duration_minutes?: number | null
  pass_marks?: number | null
  max_attempts?: number
  opens_at?: string | null
  closes_at?: string | null
  shuffle_questions?: boolean
  reveal_answers?: boolean
  is_published?: boolean
  published_at?: string | null
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
  status?: AssessmentStatus
  total_marks?: number | null
  negative_marking?: boolean
  attempt_scoring?: AttemptScoring
  release_policy?: ResultRelease
  results_released_at?: string | null
  allow_late?: boolean
  grace_minutes?: number
  late_penalty_percent?: number
  shuffle_options?: boolean
  questions_to_serve?: number | null
  allow_pause?: boolean
  difficulty?: string | null
  tags?: string[]
  learning_objectives?: string[]
  cover_path?: string | null
  version?: number
  archived_at?: string | null
  auto_marking?: boolean
}

export type AssessmentsUpdate = {
  id?: string
  institution_id?: string
  teacher_id?: string
  class_id?: string
  section_id?: string | null
  subject_id?: string | null
  academic_year_id?: string
  kind?: AssessmentKind
  title?: string
  instructions?: string | null
  duration_minutes?: number | null
  pass_marks?: number | null
  max_attempts?: number
  opens_at?: string | null
  closes_at?: string | null
  shuffle_questions?: boolean
  reveal_answers?: boolean
  is_published?: boolean
  published_at?: string | null
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
  status?: AssessmentStatus
  total_marks?: number | null
  negative_marking?: boolean
  attempt_scoring?: AttemptScoring
  release_policy?: ResultRelease
  results_released_at?: string | null
  allow_late?: boolean
  grace_minutes?: number
  late_penalty_percent?: number
  shuffle_options?: boolean
  questions_to_serve?: number | null
  allow_pause?: boolean
  difficulty?: string | null
  tags?: string[]
  learning_objectives?: string[]
  cover_path?: string | null
  version?: number
  archived_at?: string | null
  auto_marking?: boolean
}

export type AssignmentSubmissionsRow = {
  id: string
  institution_id: string
  assignment_id: string
  student_id: string
  response_text: string | null
  storage_path: string | null
  file_name: string | null
  file_size: number | null
  mime_type: string | null
  status: SubmissionStatus
  submitted_at: string | null
  marks: number | null
  feedback: string | null
  graded_by: string | null
  graded_at: string | null
  created_at: string
  updated_at: string
}

export type AssignmentSubmissionsInsert = {
  id?: string
  institution_id: string
  assignment_id: string
  student_id: string
  response_text?: string | null
  storage_path?: string | null
  file_name?: string | null
  file_size?: number | null
  mime_type?: string | null
  status?: SubmissionStatus
  submitted_at?: string | null
  marks?: number | null
  feedback?: string | null
  graded_by?: string | null
  graded_at?: string | null
  created_at?: string
  updated_at?: string
}

export type AssignmentSubmissionsUpdate = {
  id?: string
  institution_id?: string
  assignment_id?: string
  student_id?: string
  response_text?: string | null
  storage_path?: string | null
  file_name?: string | null
  file_size?: number | null
  mime_type?: string | null
  status?: SubmissionStatus
  submitted_at?: string | null
  marks?: number | null
  feedback?: string | null
  graded_by?: string | null
  graded_at?: string | null
  created_at?: string
  updated_at?: string
}

export type AssignmentsRow = {
  id: string
  institution_id: string
  teacher_id: string
  class_id: string
  section_id: string | null
  subject_id: string | null
  academic_year_id: string
  title: string
  instructions: string | null
  max_marks: number
  due_at: string
  allow_late: boolean
  storage_path: string | null
  file_name: string | null
  file_size: number | null
  mime_type: string | null
  is_published: boolean
  published_at: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type AssignmentsInsert = {
  id?: string
  institution_id: string
  teacher_id: string
  class_id: string
  section_id?: string | null
  subject_id?: string | null
  academic_year_id: string
  title: string
  instructions?: string | null
  max_marks?: number
  due_at: string
  allow_late?: boolean
  storage_path?: string | null
  file_name?: string | null
  file_size?: number | null
  mime_type?: string | null
  is_published?: boolean
  published_at?: string | null
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
}

export type AssignmentsUpdate = {
  id?: string
  institution_id?: string
  teacher_id?: string
  class_id?: string
  section_id?: string | null
  subject_id?: string | null
  academic_year_id?: string
  title?: string
  instructions?: string | null
  max_marks?: number
  due_at?: string
  allow_late?: boolean
  storage_path?: string | null
  file_name?: string | null
  file_size?: number | null
  mime_type?: string | null
  is_published?: boolean
  published_at?: string | null
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
}

export type AuditLogsRow = {
  id: string
  actor_id: string | null
  actor_role: string | null
  actor_email: string | null
  institution_id: string | null
  action: string
  entity_type: string
  entity_id: string | null
  metadata: Json
  ip_hash: string | null
  user_agent: string | null
  created_at: string
}

export type AuditLogsInsert = {
  id?: string
  actor_id?: string | null
  actor_role?: string | null
  actor_email?: string | null
  institution_id?: string | null
  action: string
  entity_type: string
  entity_id?: string | null
  metadata?: Json
  ip_hash?: string | null
  user_agent?: string | null
  created_at?: string
}

export type AuditLogsUpdate = {
  id?: string
  actor_id?: string | null
  actor_role?: string | null
  actor_email?: string | null
  institution_id?: string | null
  action?: string
  entity_type?: string
  entity_id?: string | null
  metadata?: Json
  ip_hash?: string | null
  user_agent?: string | null
  created_at?: string
}

export type ClassesRow = {
  id: string
  institution_id: string
  academic_year_id: string
  program_id: string | null
  department_id: string | null
  name: string
  code: string | null
  level_order: number | null
  capacity: number | null
  status: RecordStatus
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type ClassesInsert = {
  id?: string
  institution_id: string
  academic_year_id: string
  program_id?: string | null
  department_id?: string | null
  name: string
  code?: string | null
  level_order?: number | null
  capacity?: number | null
  status?: RecordStatus
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
}

export type ClassesUpdate = {
  id?: string
  institution_id?: string
  academic_year_id?: string
  program_id?: string | null
  department_id?: string | null
  name?: string
  code?: string | null
  level_order?: number | null
  capacity?: number | null
  status?: RecordStatus
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
}

export type ConversationsRow = {
  id: string
  institution_id: string
  teacher_id: string
  student_id: string
  started_by: string
  last_message_at: string | null
  last_message_preview: string | null
  last_sender_id: string | null
  created_at: string
  updated_at: string
}

export type ConversationsInsert = {
  id?: string
  institution_id: string
  teacher_id: string
  student_id: string
  started_by: string
  last_message_at?: string | null
  last_message_preview?: string | null
  last_sender_id?: string | null
  created_at?: string
  updated_at?: string
}

export type ConversationsUpdate = {
  id?: string
  institution_id?: string
  teacher_id?: string
  student_id?: string
  started_by?: string
  last_message_at?: string | null
  last_message_preview?: string | null
  last_sender_id?: string | null
  created_at?: string
  updated_at?: string
}

export type CoursesRow = {
  id: string
  institution_id: string
  subject_id: string
  academic_year_id: string
  class_id: string | null
  program_id: string | null
  code: string
  title: string
  description: string | null
  credits: number | null
  status: RecordStatus
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type CoursesInsert = {
  id?: string
  institution_id: string
  subject_id: string
  academic_year_id: string
  class_id?: string | null
  program_id?: string | null
  code: string
  title: string
  description?: string | null
  credits?: number | null
  status?: RecordStatus
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
}

export type CoursesUpdate = {
  id?: string
  institution_id?: string
  subject_id?: string
  academic_year_id?: string
  class_id?: string | null
  program_id?: string | null
  code?: string
  title?: string
  description?: string | null
  credits?: number | null
  status?: RecordStatus
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
}

export type DepartmentsRow = {
  id: string
  institution_id: string
  code: string
  name: string
  description: string | null
  status: RecordStatus
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type DepartmentsInsert = {
  id?: string
  institution_id: string
  code: string
  name: string
  description?: string | null
  status?: RecordStatus
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
}

export type DepartmentsUpdate = {
  id?: string
  institution_id?: string
  code?: string
  name?: string
  description?: string | null
  status?: RecordStatus
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
}

export type InstitutionAdminsRow = {
  profile_id: string
  institution_id: string
  role_guard: string
  designation: string | null
  is_primary: boolean
  status: UserStatus
  created_at: string
  updated_at: string
}

export type InstitutionAdminsInsert = {
  profile_id: string
  institution_id: string
  role_guard?: string
  designation?: string | null
  is_primary?: boolean
  status?: UserStatus
  created_at?: string
  updated_at?: string
}

export type InstitutionAdminsUpdate = {
  profile_id?: string
  institution_id?: string
  role_guard?: string
  designation?: string | null
  is_primary?: boolean
  status?: UserStatus
  created_at?: string
  updated_at?: string
}

export type InstitutionApplicationStatusHistoryRow = {
  id: string
  application_id: string
  from_status: ApplicationStatus | null
  to_status: ApplicationStatus
  actor_id: string | null
  actor_kind: string
  comments: string | null
  required_actions: Json
  created_at: string
}

export type InstitutionApplicationStatusHistoryInsert = {
  id?: string
  application_id: string
  from_status?: ApplicationStatus | null
  to_status: ApplicationStatus
  actor_id?: string | null
  actor_kind?: string
  comments?: string | null
  required_actions?: Json
  created_at?: string
}

export type InstitutionApplicationStatusHistoryUpdate = {
  id?: string
  application_id?: string
  from_status?: ApplicationStatus | null
  to_status?: ApplicationStatus
  actor_id?: string | null
  actor_kind?: string
  comments?: string | null
  required_actions?: Json
  created_at?: string
}

export type InstitutionApplicationsRow = {
  id: string
  application_ref: string
  status: ApplicationStatus
  institution_name: string
  institution_type: InstitutionType
  category: InstitutionCategory
  official_email: string
  official_phone: string | null
  website: string | null
  year_established: number | null
  registration_number: string | null
  description: string | null
  field_of_work: string | null
  address_line: string | null
  city: string | null
  state: string | null
  country: string
  postal_code: string | null
  representative_name: string | null
  representative_designation: string | null
  representative_email: string | null
  representative_phone: string | null
  estimated_student_count: number | null
  estimated_teacher_count: number | null
  departments: string[]
  programs: string[]
  specializations: string[]
  aerospace_relevance: string | null
  applicant_email: string
  draft_token_hash: string | null
  submitted_at: string | null
  review_started_at: string | null
  reviewer_id: string | null
  decided_at: string | null
  decision_reason: string | null
  institution_id: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type InstitutionApplicationsInsert = {
  id?: string
  application_ref?: string
  status?: ApplicationStatus
  institution_name: string
  institution_type: InstitutionType
  category: InstitutionCategory
  official_email: string
  official_phone?: string | null
  website?: string | null
  year_established?: number | null
  registration_number?: string | null
  description?: string | null
  field_of_work?: string | null
  address_line?: string | null
  city?: string | null
  state?: string | null
  country?: string
  postal_code?: string | null
  representative_name?: string | null
  representative_designation?: string | null
  representative_email?: string | null
  representative_phone?: string | null
  estimated_student_count?: number | null
  estimated_teacher_count?: number | null
  departments?: string[]
  programs?: string[]
  specializations?: string[]
  aerospace_relevance?: string | null
  applicant_email: string
  draft_token_hash?: string | null
  submitted_at?: string | null
  review_started_at?: string | null
  reviewer_id?: string | null
  decided_at?: string | null
  decision_reason?: string | null
  institution_id?: string | null
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
}

export type InstitutionApplicationsUpdate = {
  id?: string
  application_ref?: string
  status?: ApplicationStatus
  institution_name?: string
  institution_type?: InstitutionType
  category?: InstitutionCategory
  official_email?: string
  official_phone?: string | null
  website?: string | null
  year_established?: number | null
  registration_number?: string | null
  description?: string | null
  field_of_work?: string | null
  address_line?: string | null
  city?: string | null
  state?: string | null
  country?: string
  postal_code?: string | null
  representative_name?: string | null
  representative_designation?: string | null
  representative_email?: string | null
  representative_phone?: string | null
  estimated_student_count?: number | null
  estimated_teacher_count?: number | null
  departments?: string[]
  programs?: string[]
  specializations?: string[]
  aerospace_relevance?: string | null
  applicant_email?: string
  draft_token_hash?: string | null
  submitted_at?: string | null
  review_started_at?: string | null
  reviewer_id?: string | null
  decided_at?: string | null
  decision_reason?: string | null
  institution_id?: string | null
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
}

export type InstitutionDocumentsRow = {
  id: string
  institution_application_id: string | null
  institution_id: string | null
  uploaded_by: string | null
  document_type: DocumentType
  file_name: string
  storage_path: string
  mime_type: string
  file_size: number
  checksum_sha256: string | null
  version: number
  verification_status: VerificationStatus
  reviewer_id: string | null
  reviewed_at: string | null
  rejection_reason: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type InstitutionDocumentsInsert = {
  id?: string
  institution_application_id?: string | null
  institution_id?: string | null
  uploaded_by?: string | null
  document_type: DocumentType
  file_name: string
  storage_path: string
  mime_type: string
  file_size: number
  checksum_sha256?: string | null
  version?: number
  verification_status?: VerificationStatus
  reviewer_id?: string | null
  reviewed_at?: string | null
  rejection_reason?: string | null
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
}

export type InstitutionDocumentsUpdate = {
  id?: string
  institution_application_id?: string | null
  institution_id?: string | null
  uploaded_by?: string | null
  document_type?: DocumentType
  file_name?: string
  storage_path?: string
  mime_type?: string
  file_size?: number
  checksum_sha256?: string | null
  version?: number
  verification_status?: VerificationStatus
  reviewer_id?: string | null
  reviewed_at?: string | null
  rejection_reason?: string | null
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
}

export type InstitutionNoticesRow = {
  id: string
  institution_id: string
  author_id: string
  title: string
  body: string
  audience: NoticeAudience
  priority: NotificationPriority
  is_published: boolean
  published_at: string | null
  pinned: boolean
  expires_at: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type InstitutionNoticesInsert = {
  id?: string
  institution_id: string
  author_id: string
  title: string
  body: string
  audience?: NoticeAudience
  priority?: NotificationPriority
  is_published?: boolean
  published_at?: string | null
  pinned?: boolean
  expires_at?: string | null
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
}

export type InstitutionNoticesUpdate = {
  id?: string
  institution_id?: string
  author_id?: string
  title?: string
  body?: string
  audience?: NoticeAudience
  priority?: NotificationPriority
  is_published?: boolean
  published_at?: string | null
  pinned?: boolean
  expires_at?: string | null
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
}

export type InstitutionsRow = {
  id: string
  slug: string
  name: string
  institution_type: InstitutionType
  category: InstitutionCategory
  official_email: string
  official_phone: string | null
  website: string | null
  description: string | null
  field_of_work: string | null
  year_established: number | null
  registration_number: string | null
  address_line: string | null
  city: string | null
  state: string | null
  country: string
  postal_code: string | null
  logo_path: string | null
  status: InstitutionStatus
  approved_at: string | null
  approved_by: string | null
  suspended_at: string | null
  suspended_by: string | null
  suspension_reason: string | null
  source_application_id: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type InstitutionsInsert = {
  id?: string
  slug: string
  name: string
  institution_type: InstitutionType
  category: InstitutionCategory
  official_email: string
  official_phone?: string | null
  website?: string | null
  description?: string | null
  field_of_work?: string | null
  year_established?: number | null
  registration_number?: string | null
  address_line?: string | null
  city?: string | null
  state?: string | null
  country?: string
  postal_code?: string | null
  logo_path?: string | null
  status?: InstitutionStatus
  approved_at?: string | null
  approved_by?: string | null
  suspended_at?: string | null
  suspended_by?: string | null
  suspension_reason?: string | null
  source_application_id?: string | null
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
}

export type InstitutionsUpdate = {
  id?: string
  slug?: string
  name?: string
  institution_type?: InstitutionType
  category?: InstitutionCategory
  official_email?: string
  official_phone?: string | null
  website?: string | null
  description?: string | null
  field_of_work?: string | null
  year_established?: number | null
  registration_number?: string | null
  address_line?: string | null
  city?: string | null
  state?: string | null
  country?: string
  postal_code?: string | null
  logo_path?: string | null
  status?: InstitutionStatus
  approved_at?: string | null
  approved_by?: string | null
  suspended_at?: string | null
  suspended_by?: string | null
  suspension_reason?: string | null
  source_application_id?: string | null
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
}

export type MaterialStudyAidsRow = {
  id: string
  institution_id: string
  material_id: string
  summary: string
  key_points: string[]
  questions: Json
  source_kind: string
  model: string
  input_tokens: number
  output_tokens: number
  requested_by: string
  created_at: string
}

export type MaterialStudyAidsInsert = {
  id?: string
  institution_id: string
  material_id: string
  summary: string
  key_points?: string[]
  questions?: Json
  source_kind: string
  model: string
  input_tokens?: number
  output_tokens?: number
  requested_by: string
  created_at?: string
}

export type MaterialStudyAidsUpdate = {
  id?: string
  institution_id?: string
  material_id?: string
  summary?: string
  key_points?: string[]
  questions?: Json
  source_kind?: string
  model?: string
  input_tokens?: number
  output_tokens?: number
  requested_by?: string
  created_at?: string
}

export type MaterialsRow = {
  id: string
  institution_id: string
  teacher_id: string
  class_id: string
  section_id: string | null
  subject_id: string | null
  academic_year_id: string
  title: string
  description: string | null
  material_type: MaterialType
  storage_path: string | null
  file_name: string | null
  file_size: number | null
  mime_type: string | null
  external_url: string | null
  is_published: boolean
  published_at: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type MaterialsInsert = {
  id?: string
  institution_id: string
  teacher_id: string
  class_id: string
  section_id?: string | null
  subject_id?: string | null
  academic_year_id: string
  title: string
  description?: string | null
  material_type?: MaterialType
  storage_path?: string | null
  file_name?: string | null
  file_size?: number | null
  mime_type?: string | null
  external_url?: string | null
  is_published?: boolean
  published_at?: string | null
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
}

export type MaterialsUpdate = {
  id?: string
  institution_id?: string
  teacher_id?: string
  class_id?: string
  section_id?: string | null
  subject_id?: string | null
  academic_year_id?: string
  title?: string
  description?: string | null
  material_type?: MaterialType
  storage_path?: string | null
  file_name?: string | null
  file_size?: number | null
  mime_type?: string | null
  external_url?: string | null
  is_published?: boolean
  published_at?: string | null
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
}

export type MessagesRow = {
  id: string
  institution_id: string
  conversation_id: string
  sender_id: string
  body: string | null
  storage_path: string | null
  file_name: string | null
  mime_type: string | null
  file_size: number | null
  read_at: string | null
  created_at: string
  updated_at: string
}

export type MessagesInsert = {
  id?: string
  institution_id: string
  conversation_id: string
  sender_id: string
  body?: string | null
  storage_path?: string | null
  file_name?: string | null
  mime_type?: string | null
  file_size?: number | null
  read_at?: string | null
  created_at?: string
  updated_at?: string
}

export type MessagesUpdate = {
  id?: string
  institution_id?: string
  conversation_id?: string
  sender_id?: string
  body?: string | null
  storage_path?: string | null
  file_name?: string | null
  mime_type?: string | null
  file_size?: number | null
  read_at?: string | null
  created_at?: string
  updated_at?: string
}

export type NotificationsRow = {
  id: string
  user_id: string
  institution_id: string | null
  category: NotificationCategory
  priority: NotificationPriority
  title: string
  body: string | null
  deep_link: string | null
  read_at: string | null
  expires_at: string | null
  created_at: string
}

export type NotificationsInsert = {
  id?: string
  user_id: string
  institution_id?: string | null
  category: NotificationCategory
  priority?: NotificationPriority
  title: string
  body?: string | null
  deep_link?: string | null
  read_at?: string | null
  expires_at?: string | null
  created_at?: string
}

export type NotificationsUpdate = {
  id?: string
  user_id?: string
  institution_id?: string | null
  category?: NotificationCategory
  priority?: NotificationPriority
  title?: string
  body?: string | null
  deep_link?: string | null
  read_at?: string | null
  expires_at?: string | null
  created_at?: string
}

export type PermissionsRow = {
  code: string
  resource: string
  action: string
  scope: AuthorityScope
  description: string
  created_at: string
}

export type PermissionsInsert = {
  code: string
  resource: string
  action: string
  scope: AuthorityScope
  description: string
  created_at?: string
}

export type PermissionsUpdate = {
  code?: string
  resource?: string
  action?: string
  scope?: AuthorityScope
  description?: string
  created_at?: string
}

export type ProfilesRow = {
  id: string
  email: string
  full_name: string
  phone: string | null
  role: string
  institution_id: string | null
  status: UserStatus
  avatar_path: string | null
  locale: string
  timezone: string
  last_login_at: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type ProfilesInsert = {
  id: string
  email: string
  full_name: string
  phone?: string | null
  role: string
  institution_id?: string | null
  status?: UserStatus
  avatar_path?: string | null
  locale?: string
  timezone?: string
  last_login_at?: string | null
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
}

export type ProfilesUpdate = {
  id?: string
  email?: string
  full_name?: string
  phone?: string | null
  role?: string
  institution_id?: string | null
  status?: UserStatus
  avatar_path?: string | null
  locale?: string
  timezone?: string
  last_login_at?: string | null
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
}

export type ProgramsRow = {
  id: string
  institution_id: string
  department_id: string | null
  code: string
  name: string
  level: string | null
  duration_months: number | null
  description: string | null
  status: RecordStatus
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type ProgramsInsert = {
  id?: string
  institution_id: string
  department_id?: string | null
  code: string
  name: string
  level?: string | null
  duration_months?: number | null
  description?: string | null
  status?: RecordStatus
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
}

export type ProgramsUpdate = {
  id?: string
  institution_id?: string
  department_id?: string | null
  code?: string
  name?: string
  level?: string | null
  duration_months?: number | null
  description?: string | null
  status?: RecordStatus
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
}

export type QuestionBankItemsRow = {
  id: string
  institution_id: string
  teacher_id: string
  subject_id: string | null
  question_type: QuestionType
  prompt: string
  passage: string | null
  marks: number
  negative_marks: number
  explanation: string | null
  allow_partial_credit: boolean
  accepted_answers: string[]
  case_sensitive: boolean
  trim_whitespace: boolean
  numeric_answer: number | null
  numeric_tolerance: number | null
  numeric_unit: string | null
  allowed_mime_types: string[]
  max_file_bytes: number | null
  media_path: string | null
  media_mime_type: string | null
  difficulty: string | null
  topic: string | null
  learning_objective: string | null
  tags: string[]
  times_used: number
  archived_at: string | null
  created_at: string
  updated_at: string
  rubric: string | null
}

export type QuestionBankItemsInsert = {
  id?: string
  institution_id: string
  teacher_id: string
  subject_id?: string | null
  question_type?: QuestionType
  prompt: string
  passage?: string | null
  marks?: number
  negative_marks?: number
  explanation?: string | null
  allow_partial_credit?: boolean
  accepted_answers?: string[]
  case_sensitive?: boolean
  trim_whitespace?: boolean
  numeric_answer?: number | null
  numeric_tolerance?: number | null
  numeric_unit?: string | null
  allowed_mime_types?: string[]
  max_file_bytes?: number | null
  media_path?: string | null
  media_mime_type?: string | null
  difficulty?: string | null
  topic?: string | null
  learning_objective?: string | null
  tags?: string[]
  times_used?: number
  archived_at?: string | null
  created_at?: string
  updated_at?: string
  rubric?: string | null
}

export type QuestionBankItemsUpdate = {
  id?: string
  institution_id?: string
  teacher_id?: string
  subject_id?: string | null
  question_type?: QuestionType
  prompt?: string
  passage?: string | null
  marks?: number
  negative_marks?: number
  explanation?: string | null
  allow_partial_credit?: boolean
  accepted_answers?: string[]
  case_sensitive?: boolean
  trim_whitespace?: boolean
  numeric_answer?: number | null
  numeric_tolerance?: number | null
  numeric_unit?: string | null
  allowed_mime_types?: string[]
  max_file_bytes?: number | null
  media_path?: string | null
  media_mime_type?: string | null
  difficulty?: string | null
  topic?: string | null
  learning_objective?: string | null
  tags?: string[]
  times_used?: number
  archived_at?: string | null
  created_at?: string
  updated_at?: string
  rubric?: string | null
}

export type QuestionBankOptionsRow = {
  id: string
  institution_id: string
  bank_item_id: string
  position: number
  label: string
  match_label: string | null
  is_correct: boolean
  created_at: string
}

export type QuestionBankOptionsInsert = {
  id?: string
  institution_id: string
  bank_item_id: string
  position: number
  label: string
  match_label?: string | null
  is_correct?: boolean
  created_at?: string
}

export type QuestionBankOptionsUpdate = {
  id?: string
  institution_id?: string
  bank_item_id?: string
  position?: number
  label?: string
  match_label?: string | null
  is_correct?: boolean
  created_at?: string
}

export type RolePermissionsRow = {
  role_code: string
  permission_code: string
  created_at: string
}

export type RolePermissionsInsert = {
  role_code: string
  permission_code: string
  created_at?: string
}

export type RolePermissionsUpdate = {
  role_code?: string
  permission_code?: string
  created_at?: string
}

export type RolesRow = {
  code: string
  name: string
  description: string | null
  scope: AuthorityScope
  is_system: boolean
  rank: number
  created_at: string
  updated_at: string
}

export type RolesInsert = {
  code: string
  name: string
  description?: string | null
  scope: AuthorityScope
  is_system?: boolean
  rank?: number
  created_at?: string
  updated_at?: string
}

export type RolesUpdate = {
  code?: string
  name?: string
  description?: string | null
  scope?: AuthorityScope
  is_system?: boolean
  rank?: number
  created_at?: string
  updated_at?: string
}

export type SectionsRow = {
  id: string
  institution_id: string
  class_id: string
  name: string
  capacity: number | null
  status: RecordStatus
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type SectionsInsert = {
  id?: string
  institution_id: string
  class_id: string
  name: string
  capacity?: number | null
  status?: RecordStatus
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
}

export type SectionsUpdate = {
  id?: string
  institution_id?: string
  class_id?: string
  name?: string
  capacity?: number | null
  status?: RecordStatus
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
}

export type StudentEnrollmentsRow = {
  id: string
  institution_id: string
  student_id: string
  class_id: string
  section_id: string | null
  academic_year_id: string
  program_id: string | null
  status: EnrollmentStatus
  enrolled_on: string
  completed_on: string | null
  created_at: string
  updated_at: string
}

export type StudentEnrollmentsInsert = {
  id?: string
  institution_id: string
  student_id: string
  class_id: string
  section_id?: string | null
  academic_year_id: string
  program_id?: string | null
  status?: EnrollmentStatus
  enrolled_on?: string
  completed_on?: string | null
  created_at?: string
  updated_at?: string
}

export type StudentEnrollmentsUpdate = {
  id?: string
  institution_id?: string
  student_id?: string
  class_id?: string
  section_id?: string | null
  academic_year_id?: string
  program_id?: string | null
  status?: EnrollmentStatus
  enrolled_on?: string
  completed_on?: string | null
  created_at?: string
  updated_at?: string
}

export type StudentsRow = {
  profile_id: string
  institution_id: string
  role_guard: string
  student_code: string
  admission_number: string | null
  department_id: string | null
  program_id: string | null
  academic_year_id: string | null
  class_id: string | null
  section_id: string | null
  guardian_name: string | null
  guardian_phone: string | null
  guardian_email: string | null
  admission_date: string | null
  status: UserStatus
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type StudentsInsert = {
  profile_id: string
  institution_id: string
  role_guard?: string
  student_code: string
  admission_number?: string | null
  department_id?: string | null
  program_id?: string | null
  academic_year_id?: string | null
  class_id?: string | null
  section_id?: string | null
  guardian_name?: string | null
  guardian_phone?: string | null
  guardian_email?: string | null
  admission_date?: string | null
  status?: UserStatus
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
}

export type StudentsUpdate = {
  profile_id?: string
  institution_id?: string
  role_guard?: string
  student_code?: string
  admission_number?: string | null
  department_id?: string | null
  program_id?: string | null
  academic_year_id?: string | null
  class_id?: string | null
  section_id?: string | null
  guardian_name?: string | null
  guardian_phone?: string | null
  guardian_email?: string | null
  admission_date?: string | null
  status?: UserStatus
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
}

export type SubjectsRow = {
  id: string
  institution_id: string
  department_id: string | null
  code: string
  name: string
  description: string | null
  credits: number | null
  is_elective: boolean
  status: RecordStatus
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type SubjectsInsert = {
  id?: string
  institution_id: string
  department_id?: string | null
  code: string
  name: string
  description?: string | null
  credits?: number | null
  is_elective?: boolean
  status?: RecordStatus
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
}

export type SubjectsUpdate = {
  id?: string
  institution_id?: string
  department_id?: string | null
  code?: string
  name?: string
  description?: string | null
  credits?: number | null
  is_elective?: boolean
  status?: RecordStatus
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
}

export type SupportTicketMessagesRow = {
  id: string
  ticket_id: string
  author_id: string
  body: string
  is_internal: boolean
  created_at: string
}

export type SupportTicketMessagesInsert = {
  id?: string
  ticket_id: string
  author_id: string
  body: string
  is_internal?: boolean
  created_at?: string
}

export type SupportTicketMessagesUpdate = {
  id?: string
  ticket_id?: string
  author_id?: string
  body?: string
  is_internal?: boolean
  created_at?: string
}

export type SupportTicketsRow = {
  id: string
  reference: string
  institution_id: string
  raised_by: string
  raised_as: string
  category: TicketCategory
  priority: TicketPriority
  status: TicketStatus
  subject: string
  body: string
  assigned_to: string | null
  last_reply_at: string | null
  last_reply_by: string | null
  resolved_at: string | null
  closed_at: string | null
  created_at: string
  updated_at: string
  raised_to: TicketAudience
}

export type SupportTicketsInsert = {
  id?: string
  reference?: string
  institution_id: string
  raised_by: string
  raised_as: string
  category?: TicketCategory
  priority?: TicketPriority
  status?: TicketStatus
  subject: string
  body: string
  assigned_to?: string | null
  last_reply_at?: string | null
  last_reply_by?: string | null
  resolved_at?: string | null
  closed_at?: string | null
  created_at?: string
  updated_at?: string
  raised_to?: TicketAudience
}

export type SupportTicketsUpdate = {
  id?: string
  reference?: string
  institution_id?: string
  raised_by?: string
  raised_as?: string
  category?: TicketCategory
  priority?: TicketPriority
  status?: TicketStatus
  subject?: string
  body?: string
  assigned_to?: string | null
  last_reply_at?: string | null
  last_reply_by?: string | null
  resolved_at?: string | null
  closed_at?: string | null
  created_at?: string
  updated_at?: string
  raised_to?: TicketAudience
}

export type SystemSettingsRow = {
  key: string
  value: Json
  description: string
  is_public: boolean
  updated_by: string | null
  created_at: string
  updated_at: string
}

export type SystemSettingsInsert = {
  key: string
  value: Json
  description: string
  is_public?: boolean
  updated_by?: string | null
  created_at?: string
  updated_at?: string
}

export type SystemSettingsUpdate = {
  key?: string
  value?: Json
  description?: string
  is_public?: boolean
  updated_by?: string | null
  created_at?: string
  updated_at?: string
}

export type TeacherClassAssignmentsRow = {
  id: string
  institution_id: string
  teacher_id: string
  class_id: string
  section_id: string | null
  academic_year_id: string
  is_class_teacher: boolean
  status: RecordStatus
  created_at: string
  updated_at: string
}

export type TeacherClassAssignmentsInsert = {
  id?: string
  institution_id: string
  teacher_id: string
  class_id: string
  section_id?: string | null
  academic_year_id: string
  is_class_teacher?: boolean
  status?: RecordStatus
  created_at?: string
  updated_at?: string
}

export type TeacherClassAssignmentsUpdate = {
  id?: string
  institution_id?: string
  teacher_id?: string
  class_id?: string
  section_id?: string | null
  academic_year_id?: string
  is_class_teacher?: boolean
  status?: RecordStatus
  created_at?: string
  updated_at?: string
}

export type TeacherSubjectAssignmentsRow = {
  id: string
  institution_id: string
  teacher_id: string
  subject_id: string
  class_id: string | null
  section_id: string | null
  academic_year_id: string
  status: RecordStatus
  created_at: string
  updated_at: string
}

export type TeacherSubjectAssignmentsInsert = {
  id?: string
  institution_id: string
  teacher_id: string
  subject_id: string
  class_id?: string | null
  section_id?: string | null
  academic_year_id: string
  status?: RecordStatus
  created_at?: string
  updated_at?: string
}

export type TeacherSubjectAssignmentsUpdate = {
  id?: string
  institution_id?: string
  teacher_id?: string
  subject_id?: string
  class_id?: string | null
  section_id?: string | null
  academic_year_id?: string
  status?: RecordStatus
  created_at?: string
  updated_at?: string
}

export type TeachersRow = {
  profile_id: string
  institution_id: string
  role_guard: string
  employee_id: string
  department_id: string | null
  qualification: string | null
  specialization: string | null
  experience_years: number | null
  joining_date: string | null
  bio: string | null
  status: UserStatus
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type TeachersInsert = {
  profile_id: string
  institution_id: string
  role_guard?: string
  employee_id: string
  department_id?: string | null
  qualification?: string | null
  specialization?: string | null
  experience_years?: number | null
  joining_date?: string | null
  bio?: string | null
  status?: UserStatus
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
}

export type TeachersUpdate = {
  profile_id?: string
  institution_id?: string
  role_guard?: string
  employee_id?: string
  department_id?: string | null
  qualification?: string | null
  specialization?: string | null
  experience_years?: number | null
  joining_date?: string | null
  bio?: string | null
  status?: UserStatus
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
}


// ── Supabase client schema ─────────────────────────────────────────────────

export type Database = {
  public: {
    Tables: {
    academic_years: {
      Row: AcademicYearsRow
      Insert: AcademicYearsInsert
      Update: AcademicYearsUpdate
      Relationships: [
        {
          foreignKeyName: 'academic_years_institution_id_fkey'
          columns: ['institution_id']
          isOneToOne: false
          referencedRelation: 'institutions'
          referencedColumns: ['id']
        }
      ]
    }
    ai_grade_suggestions: {
      Row: AiGradeSuggestionsRow
      Insert: AiGradeSuggestionsInsert
      Update: AiGradeSuggestionsUpdate
      Relationships: [
        {
          foreignKeyName: 'ai_grade_suggestions_institution_id_fkey'
          columns: ['institution_id']
          isOneToOne: false
          referencedRelation: 'institutions'
          referencedColumns: ['id']
        },
        {
          foreignKeyName: 'ai_suggestions_answer_fk'
          columns: ['answer_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'assessment_answers'
          referencedColumns: ['id', 'institution_id']
        },
        {
          foreignKeyName: 'ai_suggestions_requester_fk'
          columns: ['requested_by', 'institution_id']
          isOneToOne: false
          referencedRelation: 'teachers'
          referencedColumns: ['profile_id', 'institution_id']
        }
      ]
    }
    ai_usage_events: {
      Row: AiUsageEventsRow
      Insert: AiUsageEventsInsert
      Update: AiUsageEventsUpdate
      Relationships: [
        {
          foreignKeyName: 'ai_usage_events_actor_id_fkey'
          columns: ['actor_id']
          isOneToOne: false
          referencedRelation: 'profiles'
          referencedColumns: ['id']
        },
        {
          foreignKeyName: 'ai_usage_events_institution_id_fkey'
          columns: ['institution_id']
          isOneToOne: false
          referencedRelation: 'institutions'
          referencedColumns: ['id']
        }
      ]
    }
    application_access_tokens: {
      Row: ApplicationAccessTokensRow
      Insert: ApplicationAccessTokensInsert
      Update: ApplicationAccessTokensUpdate
      Relationships: [
        {
          foreignKeyName: 'application_access_tokens_application_id_fkey'
          columns: ['application_id']
          isOneToOne: false
          referencedRelation: 'institution_applications'
          referencedColumns: ['id']
        }
      ]
    }
    assessment_answers: {
      Row: AssessmentAnswersRow
      Insert: AssessmentAnswersInsert
      Update: AssessmentAnswersUpdate
      Relationships: [
        {
          foreignKeyName: 'answers_attempt_fk'
          columns: ['attempt_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'assessment_attempts'
          referencedColumns: ['id', 'institution_id']
        },
        {
          foreignKeyName: 'answers_question_fk'
          columns: ['question_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'assessment_questions'
          referencedColumns: ['id', 'institution_id']
        },
        {
          foreignKeyName: 'assessment_answers_institution_id_fkey'
          columns: ['institution_id']
          isOneToOne: false
          referencedRelation: 'institutions'
          referencedColumns: ['id']
        }
      ]
    }
    assessment_attempts: {
      Row: AssessmentAttemptsRow
      Insert: AssessmentAttemptsInsert
      Update: AssessmentAttemptsUpdate
      Relationships: [
        {
          foreignKeyName: 'assessment_attempts_institution_id_fkey'
          columns: ['institution_id']
          isOneToOne: false
          referencedRelation: 'institutions'
          referencedColumns: ['id']
        },
        {
          foreignKeyName: 'attempts_assessment_fk'
          columns: ['assessment_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'assessments'
          referencedColumns: ['id', 'institution_id']
        },
        {
          foreignKeyName: 'attempts_student_fk'
          columns: ['student_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'students'
          referencedColumns: ['profile_id', 'institution_id']
        }
      ]
    }
    assessment_grade_revisions: {
      Row: AssessmentGradeRevisionsRow
      Insert: AssessmentGradeRevisionsInsert
      Update: AssessmentGradeRevisionsUpdate
      Relationships: [
        {
          foreignKeyName: 'assessment_grade_revisions_institution_id_fkey'
          columns: ['institution_id']
          isOneToOne: false
          referencedRelation: 'institutions'
          referencedColumns: ['id']
        },
        {
          foreignKeyName: 'grade_revisions_attempt_fk'
          columns: ['attempt_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'assessment_attempts'
          referencedColumns: ['id', 'institution_id']
        }
      ]
    }
    assessment_integrity_events: {
      Row: AssessmentIntegrityEventsRow
      Insert: AssessmentIntegrityEventsInsert
      Update: AssessmentIntegrityEventsUpdate
      Relationships: [
        {
          foreignKeyName: 'assessment_integrity_events_institution_id_fkey'
          columns: ['institution_id']
          isOneToOne: false
          referencedRelation: 'institutions'
          referencedColumns: ['id']
        },
        {
          foreignKeyName: 'integrity_attempt_fk'
          columns: ['attempt_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'assessment_attempts'
          referencedColumns: ['id', 'institution_id']
        }
      ]
    }
    assessment_options: {
      Row: AssessmentOptionsRow
      Insert: AssessmentOptionsInsert
      Update: AssessmentOptionsUpdate
      Relationships: [
        {
          foreignKeyName: 'assessment_options_institution_id_fkey'
          columns: ['institution_id']
          isOneToOne: false
          referencedRelation: 'institutions'
          referencedColumns: ['id']
        },
        {
          foreignKeyName: 'options_question_fk'
          columns: ['question_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'assessment_questions'
          referencedColumns: ['id', 'institution_id']
        }
      ]
    }
    assessment_questions: {
      Row: AssessmentQuestionsRow
      Insert: AssessmentQuestionsInsert
      Update: AssessmentQuestionsUpdate
      Relationships: [
        {
          foreignKeyName: 'assessment_questions_institution_id_fkey'
          columns: ['institution_id']
          isOneToOne: false
          referencedRelation: 'institutions'
          referencedColumns: ['id']
        },
        {
          foreignKeyName: 'questions_assessment_fk'
          columns: ['assessment_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'assessments'
          referencedColumns: ['id', 'institution_id']
        },
        {
          foreignKeyName: 'questions_section_fk'
          columns: ['section_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'assessment_sections'
          referencedColumns: ['id', 'institution_id']
        }
      ]
    }
    assessment_sections: {
      Row: AssessmentSectionsRow
      Insert: AssessmentSectionsInsert
      Update: AssessmentSectionsUpdate
      Relationships: [
        {
          foreignKeyName: 'assessment_sections_assessment_fk'
          columns: ['assessment_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'assessments'
          referencedColumns: ['id', 'institution_id']
        },
        {
          foreignKeyName: 'assessment_sections_institution_id_fkey'
          columns: ['institution_id']
          isOneToOne: false
          referencedRelation: 'institutions'
          referencedColumns: ['id']
        }
      ]
    }
    assessments: {
      Row: AssessmentsRow
      Insert: AssessmentsInsert
      Update: AssessmentsUpdate
      Relationships: [
        {
          foreignKeyName: 'assessments_academic_year_fk'
          columns: ['academic_year_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'academic_years'
          referencedColumns: ['id', 'institution_id']
        },
        {
          foreignKeyName: 'assessments_class_fk'
          columns: ['class_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'classes'
          referencedColumns: ['id', 'institution_id']
        },
        {
          foreignKeyName: 'assessments_institution_id_fkey'
          columns: ['institution_id']
          isOneToOne: false
          referencedRelation: 'institutions'
          referencedColumns: ['id']
        },
        {
          foreignKeyName: 'assessments_section_fk'
          columns: ['section_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'sections'
          referencedColumns: ['id', 'institution_id']
        },
        {
          foreignKeyName: 'assessments_subject_fk'
          columns: ['subject_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'subjects'
          referencedColumns: ['id', 'institution_id']
        },
        {
          foreignKeyName: 'assessments_teacher_fk'
          columns: ['teacher_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'teachers'
          referencedColumns: ['profile_id', 'institution_id']
        }
      ]
    }
    assignment_submissions: {
      Row: AssignmentSubmissionsRow
      Insert: AssignmentSubmissionsInsert
      Update: AssignmentSubmissionsUpdate
      Relationships: [
        {
          foreignKeyName: 'assignment_submissions_institution_id_fkey'
          columns: ['institution_id']
          isOneToOne: false
          referencedRelation: 'institutions'
          referencedColumns: ['id']
        },
        {
          foreignKeyName: 'submissions_assignment_fk'
          columns: ['assignment_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'assignments'
          referencedColumns: ['id', 'institution_id']
        },
        {
          foreignKeyName: 'submissions_grader_fk'
          columns: ['graded_by', 'institution_id']
          isOneToOne: false
          referencedRelation: 'teachers'
          referencedColumns: ['profile_id', 'institution_id']
        },
        {
          foreignKeyName: 'submissions_student_fk'
          columns: ['student_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'students'
          referencedColumns: ['profile_id', 'institution_id']
        }
      ]
    }
    assignments: {
      Row: AssignmentsRow
      Insert: AssignmentsInsert
      Update: AssignmentsUpdate
      Relationships: [
        {
          foreignKeyName: 'assignments_academic_year_fk'
          columns: ['academic_year_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'academic_years'
          referencedColumns: ['id', 'institution_id']
        },
        {
          foreignKeyName: 'assignments_class_fk'
          columns: ['class_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'classes'
          referencedColumns: ['id', 'institution_id']
        },
        {
          foreignKeyName: 'assignments_institution_id_fkey'
          columns: ['institution_id']
          isOneToOne: false
          referencedRelation: 'institutions'
          referencedColumns: ['id']
        },
        {
          foreignKeyName: 'assignments_section_fk'
          columns: ['section_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'sections'
          referencedColumns: ['id', 'institution_id']
        },
        {
          foreignKeyName: 'assignments_subject_fk'
          columns: ['subject_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'subjects'
          referencedColumns: ['id', 'institution_id']
        },
        {
          foreignKeyName: 'assignments_teacher_fk'
          columns: ['teacher_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'teachers'
          referencedColumns: ['profile_id', 'institution_id']
        }
      ]
    }
    audit_logs: {
      Row: AuditLogsRow
      Insert: AuditLogsInsert
      Update: AuditLogsUpdate
      Relationships: [
        {
          foreignKeyName: 'audit_logs_actor_id_fkey'
          columns: ['actor_id']
          isOneToOne: false
          referencedRelation: 'profiles'
          referencedColumns: ['id']
        },
        {
          foreignKeyName: 'audit_logs_institution_id_fkey'
          columns: ['institution_id']
          isOneToOne: false
          referencedRelation: 'institutions'
          referencedColumns: ['id']
        }
      ]
    }
    classes: {
      Row: ClassesRow
      Insert: ClassesInsert
      Update: ClassesUpdate
      Relationships: [
        {
          foreignKeyName: 'classes_academic_year_fk'
          columns: ['academic_year_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'academic_years'
          referencedColumns: ['id', 'institution_id']
        },
        {
          foreignKeyName: 'classes_department_fk'
          columns: ['department_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'departments'
          referencedColumns: ['id', 'institution_id']
        },
        {
          foreignKeyName: 'classes_institution_id_fkey'
          columns: ['institution_id']
          isOneToOne: false
          referencedRelation: 'institutions'
          referencedColumns: ['id']
        },
        {
          foreignKeyName: 'classes_program_fk'
          columns: ['program_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'programs'
          referencedColumns: ['id', 'institution_id']
        }
      ]
    }
    conversations: {
      Row: ConversationsRow
      Insert: ConversationsInsert
      Update: ConversationsUpdate
      Relationships: [
        {
          foreignKeyName: 'conversations_institution_id_fkey'
          columns: ['institution_id']
          isOneToOne: false
          referencedRelation: 'institutions'
          referencedColumns: ['id']
        },
        {
          foreignKeyName: 'conversations_started_by_fkey'
          columns: ['started_by']
          isOneToOne: false
          referencedRelation: 'profiles'
          referencedColumns: ['id']
        },
        {
          foreignKeyName: 'conversations_student_fk'
          columns: ['student_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'students'
          referencedColumns: ['profile_id', 'institution_id']
        },
        {
          foreignKeyName: 'conversations_teacher_fk'
          columns: ['teacher_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'teachers'
          referencedColumns: ['profile_id', 'institution_id']
        }
      ]
    }
    courses: {
      Row: CoursesRow
      Insert: CoursesInsert
      Update: CoursesUpdate
      Relationships: [
        {
          foreignKeyName: 'courses_academic_year_fk'
          columns: ['academic_year_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'academic_years'
          referencedColumns: ['id', 'institution_id']
        },
        {
          foreignKeyName: 'courses_class_fk'
          columns: ['class_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'classes'
          referencedColumns: ['id', 'institution_id']
        },
        {
          foreignKeyName: 'courses_institution_id_fkey'
          columns: ['institution_id']
          isOneToOne: false
          referencedRelation: 'institutions'
          referencedColumns: ['id']
        },
        {
          foreignKeyName: 'courses_program_fk'
          columns: ['program_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'programs'
          referencedColumns: ['id', 'institution_id']
        },
        {
          foreignKeyName: 'courses_subject_fk'
          columns: ['subject_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'subjects'
          referencedColumns: ['id', 'institution_id']
        }
      ]
    }
    departments: {
      Row: DepartmentsRow
      Insert: DepartmentsInsert
      Update: DepartmentsUpdate
      Relationships: [
        {
          foreignKeyName: 'departments_institution_id_fkey'
          columns: ['institution_id']
          isOneToOne: false
          referencedRelation: 'institutions'
          referencedColumns: ['id']
        }
      ]
    }
    institution_admins: {
      Row: InstitutionAdminsRow
      Insert: InstitutionAdminsInsert
      Update: InstitutionAdminsUpdate
      Relationships: [
        {
          foreignKeyName: 'institution_admins_institution_id_fkey'
          columns: ['institution_id']
          isOneToOne: false
          referencedRelation: 'institutions'
          referencedColumns: ['id']
        },
        {
          foreignKeyName: 'institution_admins_profile_fk'
          columns: ['profile_id', 'role_guard', 'institution_id']
          isOneToOne: false
          referencedRelation: 'profiles'
          referencedColumns: ['id', 'role', 'institution_id']
        },
        {
          foreignKeyName: 'institution_admins_profile_id_fkey'
          columns: ['profile_id']
          isOneToOne: true
          referencedRelation: 'profiles'
          referencedColumns: ['id']
        }
      ]
    }
    institution_application_status_history: {
      Row: InstitutionApplicationStatusHistoryRow
      Insert: InstitutionApplicationStatusHistoryInsert
      Update: InstitutionApplicationStatusHistoryUpdate
      Relationships: [
        {
          foreignKeyName: 'institution_application_status_history_actor_id_fkey'
          columns: ['actor_id']
          isOneToOne: false
          referencedRelation: 'profiles'
          referencedColumns: ['id']
        },
        {
          foreignKeyName: 'institution_application_status_history_application_id_fkey'
          columns: ['application_id']
          isOneToOne: false
          referencedRelation: 'institution_applications'
          referencedColumns: ['id']
        }
      ]
    }
    institution_applications: {
      Row: InstitutionApplicationsRow
      Insert: InstitutionApplicationsInsert
      Update: InstitutionApplicationsUpdate
      Relationships: [
        {
          foreignKeyName: 'institution_applications_institution_id_fkey'
          columns: ['institution_id']
          isOneToOne: false
          referencedRelation: 'institutions'
          referencedColumns: ['id']
        },
        {
          foreignKeyName: 'institution_applications_reviewer_id_fkey'
          columns: ['reviewer_id']
          isOneToOne: false
          referencedRelation: 'profiles'
          referencedColumns: ['id']
        }
      ]
    }
    institution_documents: {
      Row: InstitutionDocumentsRow
      Insert: InstitutionDocumentsInsert
      Update: InstitutionDocumentsUpdate
      Relationships: [
        {
          foreignKeyName: 'institution_documents_institution_application_id_fkey'
          columns: ['institution_application_id']
          isOneToOne: false
          referencedRelation: 'institution_applications'
          referencedColumns: ['id']
        },
        {
          foreignKeyName: 'institution_documents_institution_id_fkey'
          columns: ['institution_id']
          isOneToOne: false
          referencedRelation: 'institutions'
          referencedColumns: ['id']
        },
        {
          foreignKeyName: 'institution_documents_reviewer_id_fkey'
          columns: ['reviewer_id']
          isOneToOne: false
          referencedRelation: 'profiles'
          referencedColumns: ['id']
        },
        {
          foreignKeyName: 'institution_documents_uploaded_by_fkey'
          columns: ['uploaded_by']
          isOneToOne: false
          referencedRelation: 'profiles'
          referencedColumns: ['id']
        }
      ]
    }
    institution_notices: {
      Row: InstitutionNoticesRow
      Insert: InstitutionNoticesInsert
      Update: InstitutionNoticesUpdate
      Relationships: [
        {
          foreignKeyName: 'institution_notices_author_id_fkey'
          columns: ['author_id']
          isOneToOne: false
          referencedRelation: 'profiles'
          referencedColumns: ['id']
        },
        {
          foreignKeyName: 'institution_notices_institution_id_fkey'
          columns: ['institution_id']
          isOneToOne: false
          referencedRelation: 'institutions'
          referencedColumns: ['id']
        }
      ]
    }
    institutions: {
      Row: InstitutionsRow
      Insert: InstitutionsInsert
      Update: InstitutionsUpdate
      Relationships: [
        {
          foreignKeyName: 'institutions_approved_by_fk'
          columns: ['approved_by']
          isOneToOne: false
          referencedRelation: 'profiles'
          referencedColumns: ['id']
        },
        {
          foreignKeyName: 'institutions_source_application_fk'
          columns: ['source_application_id']
          isOneToOne: false
          referencedRelation: 'institution_applications'
          referencedColumns: ['id']
        },
        {
          foreignKeyName: 'institutions_suspended_by_fk'
          columns: ['suspended_by']
          isOneToOne: false
          referencedRelation: 'profiles'
          referencedColumns: ['id']
        }
      ]
    }
    material_study_aids: {
      Row: MaterialStudyAidsRow
      Insert: MaterialStudyAidsInsert
      Update: MaterialStudyAidsUpdate
      Relationships: [
        {
          foreignKeyName: 'material_study_aids_institution_id_fkey'
          columns: ['institution_id']
          isOneToOne: false
          referencedRelation: 'institutions'
          referencedColumns: ['id']
        },
        {
          foreignKeyName: 'material_study_aids_requested_by_fkey'
          columns: ['requested_by']
          isOneToOne: false
          referencedRelation: 'profiles'
          referencedColumns: ['id']
        },
        {
          foreignKeyName: 'study_aids_material_fk'
          columns: ['material_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'materials'
          referencedColumns: ['id', 'institution_id']
        }
      ]
    }
    materials: {
      Row: MaterialsRow
      Insert: MaterialsInsert
      Update: MaterialsUpdate
      Relationships: [
        {
          foreignKeyName: 'materials_academic_year_fk'
          columns: ['academic_year_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'academic_years'
          referencedColumns: ['id', 'institution_id']
        },
        {
          foreignKeyName: 'materials_class_fk'
          columns: ['class_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'classes'
          referencedColumns: ['id', 'institution_id']
        },
        {
          foreignKeyName: 'materials_institution_id_fkey'
          columns: ['institution_id']
          isOneToOne: false
          referencedRelation: 'institutions'
          referencedColumns: ['id']
        },
        {
          foreignKeyName: 'materials_section_fk'
          columns: ['section_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'sections'
          referencedColumns: ['id', 'institution_id']
        },
        {
          foreignKeyName: 'materials_subject_fk'
          columns: ['subject_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'subjects'
          referencedColumns: ['id', 'institution_id']
        },
        {
          foreignKeyName: 'materials_teacher_fk'
          columns: ['teacher_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'teachers'
          referencedColumns: ['profile_id', 'institution_id']
        }
      ]
    }
    messages: {
      Row: MessagesRow
      Insert: MessagesInsert
      Update: MessagesUpdate
      Relationships: [
        {
          foreignKeyName: 'messages_conversation_fk'
          columns: ['conversation_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'conversations'
          referencedColumns: ['id', 'institution_id']
        },
        {
          foreignKeyName: 'messages_institution_id_fkey'
          columns: ['institution_id']
          isOneToOne: false
          referencedRelation: 'institutions'
          referencedColumns: ['id']
        },
        {
          foreignKeyName: 'messages_sender_id_fkey'
          columns: ['sender_id']
          isOneToOne: false
          referencedRelation: 'profiles'
          referencedColumns: ['id']
        }
      ]
    }
    notifications: {
      Row: NotificationsRow
      Insert: NotificationsInsert
      Update: NotificationsUpdate
      Relationships: [
        {
          foreignKeyName: 'notifications_institution_id_fkey'
          columns: ['institution_id']
          isOneToOne: false
          referencedRelation: 'institutions'
          referencedColumns: ['id']
        },
        {
          foreignKeyName: 'notifications_user_id_fkey'
          columns: ['user_id']
          isOneToOne: false
          referencedRelation: 'profiles'
          referencedColumns: ['id']
        }
      ]
    }
    permissions: {
      Row: PermissionsRow
      Insert: PermissionsInsert
      Update: PermissionsUpdate
      Relationships: [

      ]
    }
    profiles: {
      Row: ProfilesRow
      Insert: ProfilesInsert
      Update: ProfilesUpdate
      Relationships: [
        {
          foreignKeyName: 'profiles_institution_id_fkey'
          columns: ['institution_id']
          isOneToOne: false
          referencedRelation: 'institutions'
          referencedColumns: ['id']
        },
        {
          foreignKeyName: 'profiles_role_fkey'
          columns: ['role']
          isOneToOne: false
          referencedRelation: 'roles'
          referencedColumns: ['code']
        }
      ]
    }
    programs: {
      Row: ProgramsRow
      Insert: ProgramsInsert
      Update: ProgramsUpdate
      Relationships: [
        {
          foreignKeyName: 'programs_department_fk'
          columns: ['department_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'departments'
          referencedColumns: ['id', 'institution_id']
        },
        {
          foreignKeyName: 'programs_institution_id_fkey'
          columns: ['institution_id']
          isOneToOne: false
          referencedRelation: 'institutions'
          referencedColumns: ['id']
        }
      ]
    }
    question_bank_items: {
      Row: QuestionBankItemsRow
      Insert: QuestionBankItemsInsert
      Update: QuestionBankItemsUpdate
      Relationships: [
        {
          foreignKeyName: 'question_bank_items_institution_id_fkey'
          columns: ['institution_id']
          isOneToOne: false
          referencedRelation: 'institutions'
          referencedColumns: ['id']
        },
        {
          foreignKeyName: 'question_bank_subject_fk'
          columns: ['subject_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'subjects'
          referencedColumns: ['id', 'institution_id']
        },
        {
          foreignKeyName: 'question_bank_teacher_fk'
          columns: ['teacher_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'teachers'
          referencedColumns: ['profile_id', 'institution_id']
        }
      ]
    }
    question_bank_options: {
      Row: QuestionBankOptionsRow
      Insert: QuestionBankOptionsInsert
      Update: QuestionBankOptionsUpdate
      Relationships: [
        {
          foreignKeyName: 'bank_options_item_fk'
          columns: ['bank_item_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'question_bank_items'
          referencedColumns: ['id', 'institution_id']
        },
        {
          foreignKeyName: 'question_bank_options_institution_id_fkey'
          columns: ['institution_id']
          isOneToOne: false
          referencedRelation: 'institutions'
          referencedColumns: ['id']
        }
      ]
    }
    role_permissions: {
      Row: RolePermissionsRow
      Insert: RolePermissionsInsert
      Update: RolePermissionsUpdate
      Relationships: [
        {
          foreignKeyName: 'role_permissions_permission_code_fkey'
          columns: ['permission_code']
          isOneToOne: false
          referencedRelation: 'permissions'
          referencedColumns: ['code']
        },
        {
          foreignKeyName: 'role_permissions_role_code_fkey'
          columns: ['role_code']
          isOneToOne: false
          referencedRelation: 'roles'
          referencedColumns: ['code']
        }
      ]
    }
    roles: {
      Row: RolesRow
      Insert: RolesInsert
      Update: RolesUpdate
      Relationships: [

      ]
    }
    sections: {
      Row: SectionsRow
      Insert: SectionsInsert
      Update: SectionsUpdate
      Relationships: [
        {
          foreignKeyName: 'sections_class_fk'
          columns: ['class_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'classes'
          referencedColumns: ['id', 'institution_id']
        },
        {
          foreignKeyName: 'sections_institution_id_fkey'
          columns: ['institution_id']
          isOneToOne: false
          referencedRelation: 'institutions'
          referencedColumns: ['id']
        }
      ]
    }
    student_enrollments: {
      Row: StudentEnrollmentsRow
      Insert: StudentEnrollmentsInsert
      Update: StudentEnrollmentsUpdate
      Relationships: [
        {
          foreignKeyName: 'enrollments_academic_year_fk'
          columns: ['academic_year_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'academic_years'
          referencedColumns: ['id', 'institution_id']
        },
        {
          foreignKeyName: 'enrollments_class_fk'
          columns: ['class_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'classes'
          referencedColumns: ['id', 'institution_id']
        },
        {
          foreignKeyName: 'enrollments_program_fk'
          columns: ['program_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'programs'
          referencedColumns: ['id', 'institution_id']
        },
        {
          foreignKeyName: 'enrollments_section_fk'
          columns: ['section_id', 'class_id']
          isOneToOne: false
          referencedRelation: 'sections'
          referencedColumns: ['id', 'class_id']
        },
        {
          foreignKeyName: 'enrollments_student_fk'
          columns: ['student_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'students'
          referencedColumns: ['profile_id', 'institution_id']
        },
        {
          foreignKeyName: 'student_enrollments_institution_id_fkey'
          columns: ['institution_id']
          isOneToOne: false
          referencedRelation: 'institutions'
          referencedColumns: ['id']
        }
      ]
    }
    students: {
      Row: StudentsRow
      Insert: StudentsInsert
      Update: StudentsUpdate
      Relationships: [
        {
          foreignKeyName: 'students_academic_year_fk'
          columns: ['academic_year_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'academic_years'
          referencedColumns: ['id', 'institution_id']
        },
        {
          foreignKeyName: 'students_class_fk'
          columns: ['class_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'classes'
          referencedColumns: ['id', 'institution_id']
        },
        {
          foreignKeyName: 'students_department_fk'
          columns: ['department_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'departments'
          referencedColumns: ['id', 'institution_id']
        },
        {
          foreignKeyName: 'students_institution_id_fkey'
          columns: ['institution_id']
          isOneToOne: false
          referencedRelation: 'institutions'
          referencedColumns: ['id']
        },
        {
          foreignKeyName: 'students_profile_fk'
          columns: ['profile_id', 'role_guard', 'institution_id']
          isOneToOne: false
          referencedRelation: 'profiles'
          referencedColumns: ['id', 'role', 'institution_id']
        },
        {
          foreignKeyName: 'students_profile_id_fkey'
          columns: ['profile_id']
          isOneToOne: true
          referencedRelation: 'profiles'
          referencedColumns: ['id']
        },
        {
          foreignKeyName: 'students_program_fk'
          columns: ['program_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'programs'
          referencedColumns: ['id', 'institution_id']
        },
        {
          foreignKeyName: 'students_section_in_class_fk'
          columns: ['section_id', 'class_id']
          isOneToOne: false
          referencedRelation: 'sections'
          referencedColumns: ['id', 'class_id']
        }
      ]
    }
    subjects: {
      Row: SubjectsRow
      Insert: SubjectsInsert
      Update: SubjectsUpdate
      Relationships: [
        {
          foreignKeyName: 'subjects_department_fk'
          columns: ['department_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'departments'
          referencedColumns: ['id', 'institution_id']
        },
        {
          foreignKeyName: 'subjects_institution_id_fkey'
          columns: ['institution_id']
          isOneToOne: false
          referencedRelation: 'institutions'
          referencedColumns: ['id']
        }
      ]
    }
    support_ticket_messages: {
      Row: SupportTicketMessagesRow
      Insert: SupportTicketMessagesInsert
      Update: SupportTicketMessagesUpdate
      Relationships: [
        {
          foreignKeyName: 'support_ticket_messages_author_id_fkey'
          columns: ['author_id']
          isOneToOne: false
          referencedRelation: 'profiles'
          referencedColumns: ['id']
        },
        {
          foreignKeyName: 'support_ticket_messages_ticket_id_fkey'
          columns: ['ticket_id']
          isOneToOne: false
          referencedRelation: 'support_tickets'
          referencedColumns: ['id']
        }
      ]
    }
    support_tickets: {
      Row: SupportTicketsRow
      Insert: SupportTicketsInsert
      Update: SupportTicketsUpdate
      Relationships: [
        {
          foreignKeyName: 'support_tickets_assigned_to_fkey'
          columns: ['assigned_to']
          isOneToOne: false
          referencedRelation: 'profiles'
          referencedColumns: ['id']
        },
        {
          foreignKeyName: 'support_tickets_institution_id_fkey'
          columns: ['institution_id']
          isOneToOne: false
          referencedRelation: 'institutions'
          referencedColumns: ['id']
        },
        {
          foreignKeyName: 'support_tickets_raised_by_fkey'
          columns: ['raised_by']
          isOneToOne: false
          referencedRelation: 'profiles'
          referencedColumns: ['id']
        }
      ]
    }
    system_settings: {
      Row: SystemSettingsRow
      Insert: SystemSettingsInsert
      Update: SystemSettingsUpdate
      Relationships: [
        {
          foreignKeyName: 'system_settings_updated_by_fkey'
          columns: ['updated_by']
          isOneToOne: false
          referencedRelation: 'profiles'
          referencedColumns: ['id']
        }
      ]
    }
    teacher_class_assignments: {
      Row: TeacherClassAssignmentsRow
      Insert: TeacherClassAssignmentsInsert
      Update: TeacherClassAssignmentsUpdate
      Relationships: [
        {
          foreignKeyName: 'tca_academic_year_fk'
          columns: ['academic_year_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'academic_years'
          referencedColumns: ['id', 'institution_id']
        },
        {
          foreignKeyName: 'tca_class_fk'
          columns: ['class_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'classes'
          referencedColumns: ['id', 'institution_id']
        },
        {
          foreignKeyName: 'tca_section_fk'
          columns: ['section_id', 'class_id']
          isOneToOne: false
          referencedRelation: 'sections'
          referencedColumns: ['id', 'class_id']
        },
        {
          foreignKeyName: 'tca_teacher_fk'
          columns: ['teacher_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'teachers'
          referencedColumns: ['profile_id', 'institution_id']
        },
        {
          foreignKeyName: 'teacher_class_assignments_institution_id_fkey'
          columns: ['institution_id']
          isOneToOne: false
          referencedRelation: 'institutions'
          referencedColumns: ['id']
        }
      ]
    }
    teacher_subject_assignments: {
      Row: TeacherSubjectAssignmentsRow
      Insert: TeacherSubjectAssignmentsInsert
      Update: TeacherSubjectAssignmentsUpdate
      Relationships: [
        {
          foreignKeyName: 'teacher_subject_assignments_institution_id_fkey'
          columns: ['institution_id']
          isOneToOne: false
          referencedRelation: 'institutions'
          referencedColumns: ['id']
        },
        {
          foreignKeyName: 'tsa_academic_year_fk'
          columns: ['academic_year_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'academic_years'
          referencedColumns: ['id', 'institution_id']
        },
        {
          foreignKeyName: 'tsa_class_fk'
          columns: ['class_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'classes'
          referencedColumns: ['id', 'institution_id']
        },
        {
          foreignKeyName: 'tsa_section_fk'
          columns: ['section_id', 'class_id']
          isOneToOne: false
          referencedRelation: 'sections'
          referencedColumns: ['id', 'class_id']
        },
        {
          foreignKeyName: 'tsa_subject_fk'
          columns: ['subject_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'subjects'
          referencedColumns: ['id', 'institution_id']
        },
        {
          foreignKeyName: 'tsa_teacher_fk'
          columns: ['teacher_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'teachers'
          referencedColumns: ['profile_id', 'institution_id']
        }
      ]
    }
    teachers: {
      Row: TeachersRow
      Insert: TeachersInsert
      Update: TeachersUpdate
      Relationships: [
        {
          foreignKeyName: 'teachers_department_fk'
          columns: ['department_id', 'institution_id']
          isOneToOne: false
          referencedRelation: 'departments'
          referencedColumns: ['id', 'institution_id']
        },
        {
          foreignKeyName: 'teachers_institution_id_fkey'
          columns: ['institution_id']
          isOneToOne: false
          referencedRelation: 'institutions'
          referencedColumns: ['id']
        },
        {
          foreignKeyName: 'teachers_profile_fk'
          columns: ['profile_id', 'role_guard', 'institution_id']
          isOneToOne: false
          referencedRelation: 'profiles'
          referencedColumns: ['id', 'role', 'institution_id']
        },
        {
          foreignKeyName: 'teachers_profile_id_fkey'
          columns: ['profile_id']
          isOneToOne: true
          referencedRelation: 'profiles'
          referencedColumns: ['id']
        }
      ]
    }
    }
    Views: Record<string, never>
    /*
     * Hand-maintained, unlike Tables above.
     *
     * The generator introspects catalogs for tables and enums but not for
     * functions: PostgREST's argument and return shapes for a plpgsql function
     * returning jsonb cannot be recovered from pg_proc in a form TypeScript can
     * use. Adding a database function therefore means adding it here too, or
     * every rpc() call for it is a type error.
     */
    Functions: {
      transition_application: {
        Args: { target_id: string; new_status: ApplicationStatus; comments?: string | null }
        Returns: InstitutionApplicationsRow
      }
      activate_own_account: {
        Args: Record<string, never>
        Returns: UserStatus
      }
      public_start_application: {
        Args: {
          token_hash: string
          institution_name: string
          institution_type: InstitutionType
          category: InstitutionCategory
          official_email: string
          applicant_email: string
        }
        Returns: string
      }
      public_save_application: {
        Args: { application_id: string; token_hash: string; patch: Json }
        Returns: boolean
      }
      public_get_application: {
        Args: { application_id: string; token_hash: string }
        Returns: Json
      }
      public_submit_application: {
        Args: { application_id: string; token_hash: string }
        Returns: Json
      }
      public_attach_document: {
        Args: {
          application_id: string
          token_hash: string
          document_type: DocumentType
          file_name: string
          storage_path: string
          mime_type: string
          file_size: number
        }
        Returns: string
      }
      public_list_documents: {
        Args: { application_id: string; token_hash: string }
        Returns: {
          id: string
          document_type: DocumentType
          file_name: string
          file_size: number
          verification_status: VerificationStatus
          rejection_reason: string | null
          created_at: string
        }[]
      }
      public_remove_document: {
        Args: { application_id: string; token_hash: string; document_id: string }
        Returns: string
      }
      public_request_application_access: {
        Args: {
          application_ref: string
          applicant_email: string
          code_hash: string
          ttl_minutes?: number
        }
        Returns: string
      }
      public_verify_application_access: {
        Args: { application_ref: string; code_hash: string }
        Returns: Json
      }
      public_platform_stats: {
        Args: Record<string, never>
        Returns: {
          institutions: number
          educators: number
          learners: number
          programs: number
          states: number
        }[]
      }
      public_institution_directory: {
        Args: { max_rows?: number }
        Returns: {
          slug: string
          name: string
          institution_type: InstitutionType
          category: InstitutionCategory
          city: string | null
          state: string | null
          country: string
          field_of_work: string | null
          logo_path: string | null
          approved_at: string | null
        }[]
      }
      public_institution_by_slug: {
        Args: { target_slug: string }
        Returns: {
          slug: string
          name: string
          institution_type: InstitutionType
          category: InstitutionCategory
          description: string | null
          field_of_work: string | null
          website: string | null
          city: string | null
          state: string | null
          country: string
          year_established: number | null
          logo_path: string | null
          approved_at: string | null
        }[]
      }
      public_settings: {
        Args: Record<string, never>
        Returns: { key: string; value: Json }[]
      }
      student_start_attempt: {
        Args: { target_assessment_id: string }
        Returns: string
      }
      student_get_paper: {
        Args: { target_attempt_id: string }
        Returns: Json
      }
      student_answer_question: {
        Args: {
          target_attempt_id: string
          target_question_id: string
          option_ids: string[]
          answer_text: string | null
          payload?: Json
        }
        Returns: Json
      }
      student_submit_attempt: {
        Args: { target_attempt_id: string; expired?: boolean }
        Returns: Json
      }
      student_mark_for_review: {
        Args: { target_attempt_id: string; question_ids: string[] }
        Returns: boolean
      }
      teacher_set_question_media: {
        Args: { target_question_id: string; path: string | null; content_type: string | null }
        Returns: boolean
      }
      assessment_question_media: {
        Args: { target_question_id: string }
        Returns: string | null
      }
      student_pause_attempt: {
        Args: { target_attempt_id: string }
        Returns: Json
      }
      student_resume_attempt: {
        Args: { target_attempt_id: string }
        Returns: Json
      }
      student_attach_file: {
        Args: {
          target_attempt_id: string
          target_question_id: string
          path: string
          original_name: string
          size_bytes: number
          content_type: string
        }
        Returns: Json
      }
      assessment_answer_file: {
        Args: { target_answer_id: string }
        Returns: string | null
      }
      teacher_release_results: {
        Args: { target_assessment_id: string }
        Returns: number
      }
      student_get_result: {
        Args: { target_attempt_id: string }
        Returns: Json
      }
      teacher_grade_answer: {
        Args: { target_answer_id: string; awarded: number; comment?: string | null }
        Returns: Json
      }
      provision_profile: {
        Args: {
          user_id: string
          user_email: string
          full_name: string
          role: string
          institution_id: string
        }
        Returns: ProfilesRow
      }
      touch_last_login: {
        Args: Record<string, never>
        Returns: undefined
      }
      write_audit_log: {
        Args: { action: string; entity_type: string; entity_id?: string | null; metadata?: Json }
        Returns: string
      }
      my_message_contacts: {
        Args: Record<string, never>
        Returns: { profile_id: string; full_name: string; subtitle: string }[]
      }
      my_conversations: {
        Args: Record<string, never>
        Returns: {
          id: string
          counterpart_id: string
          counterpart_name: string
          counterpart_role: string
          last_message_at: string | null
          last_message_preview: string | null
          last_sender_id: string | null
          /* bigint, which PostgREST renders as a JSON number. */
          unread_count: number
        }[]
      }
      my_conversation: {
        Args: { target_id: string }
        Returns: {
          id: string
          counterpart_id: string
          counterpart_name: string
          counterpart_role: string
        }[]
      }
    }
    Enums: {
    academic_year_status: AcademicYearStatus
    application_status: ApplicationStatus
    assessment_kind: AssessmentKind
    assessment_status: AssessmentStatus
    attempt_scoring: AttemptScoring
    attempt_status: AttemptStatus
    authority_scope: AuthorityScope
    document_type: DocumentType
    enrollment_status: EnrollmentStatus
    institution_category: InstitutionCategory
    institution_status: InstitutionStatus
    institution_type: InstitutionType
    integrity_event: IntegrityEvent
    material_type: MaterialType
    notice_audience: NoticeAudience
    notification_category: NotificationCategory
    notification_priority: NotificationPriority
    question_type: QuestionType
    record_status: RecordStatus
    result_release: ResultRelease
    submission_status: SubmissionStatus
    ticket_audience: TicketAudience
    ticket_category: TicketCategory
    ticket_priority: TicketPriority
    ticket_status: TicketStatus
    user_status: UserStatus
    verification_status: VerificationStatus
    }
    CompositeTypes: Record<string, never>
  }
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']
export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T]
