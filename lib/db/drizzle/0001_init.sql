CREATE TYPE "public"."resource_type" AS ENUM('pdf', 'word', 'powerpoint', 'image', 'archive', 'youtube', 'link');--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'super_admin';--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"subdomain" varchar(100) NOT NULL,
	"domain" varchar(255),
	"country" varchar(100),
	"logo_url" text,
	"primary_color" varchar(20) DEFAULT '#1778c2',
	"active" boolean DEFAULT true NOT NULL,
	"contact_email" varchar(255),
	"plan_type" varchar(50) DEFAULT 'standard',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_subdomain_unique" UNIQUE("subdomain")
);
--> statement-breakpoint
CREATE TABLE "payment_schedule_installments" (
	"id" serial PRIMARY KEY NOT NULL,
	"schedule_id" integer NOT NULL,
	"label" varchar(255) NOT NULL,
	"amount" real NOT NULL,
	"due_date" date NOT NULL,
	"order" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_schedules" (
	"id" serial PRIMARY KEY NOT NULL,
	"class_id" integer,
	"name" varchar(255) NOT NULL,
	"total_amount" real NOT NULL,
	"academic_year" varchar(20),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_downloads" (
	"id" serial PRIMARY KEY NOT NULL,
	"resource_id" integer NOT NULL,
	"student_id" integer NOT NULL,
	"downloaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_quiz_questions" (
	"id" serial PRIMARY KEY NOT NULL,
	"quiz_id" integer NOT NULL,
	"texte" text NOT NULL,
	"type" varchar(20) DEFAULT 'qcm' NOT NULL,
	"explication" text,
	"points" integer DEFAULT 1 NOT NULL,
	"ordre" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_quiz_reponses" (
	"id" serial PRIMARY KEY NOT NULL,
	"question_id" integer NOT NULL,
	"texte" varchar(500) NOT NULL,
	"est_correcte" boolean DEFAULT false NOT NULL,
	"ordre" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_quiz_resultats" (
	"id" serial PRIMARY KEY NOT NULL,
	"quiz_id" integer NOT NULL,
	"etudiant_id" integer NOT NULL,
	"score" real NOT NULL,
	"max_score" real NOT NULL,
	"duree_secondes" integer,
	"tentative" integer DEFAULT 1 NOT NULL,
	"reponses_donnees" text DEFAULT '{}' NOT NULL,
	"termine_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_quiz" (
	"id" serial PRIMARY KEY NOT NULL,
	"resource_id" integer NOT NULL,
	"titre" varchar(200) NOT NULL,
	"duree_minutes" integer,
	"note_minimale" real,
	"nb_tentatives" integer DEFAULT 2 NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"cree_par" integer NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_resources" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"title" varchar(255) NOT NULL,
	"type" "resource_type" NOT NULL,
	"subject_id" integer,
	"semester_id" integer,
	"class_ids" text DEFAULT '[]' NOT NULL,
	"teacher_id" integer NOT NULL,
	"file_url" text,
	"file_name" varchar(255),
	"file_size" integer,
	"description" text,
	"available_from" timestamp,
	"suspended" boolean DEFAULT false NOT NULL,
	"download_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_time_tracking" (
	"id" serial PRIMARY KEY NOT NULL,
	"resource_id" integer NOT NULL,
	"student_id" integer NOT NULL,
	"duree_secondes" integer NOT NULL,
	"tracked_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webauthn_credentials" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"credential_id" text NOT NULL,
	"public_key" text NOT NULL,
	"counter" integer DEFAULT 0 NOT NULL,
	"device_type" varchar(50),
	"device_name" varchar(255),
	"aaguid" varchar(64),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp,
	CONSTRAINT "webauthn_credentials_credential_id_unique" UNIQUE("credential_id")
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_email_unique";--> statement-breakpoint
ALTER TABLE "attendance_sessions" DROP CONSTRAINT "attendance_sessions_teacher_id_subject_id_class_id_session_date";--> statement-breakpoint
ALTER TABLE "attendance" DROP CONSTRAINT "attendance_teacher_id_subject_id_class_id_session_date_student_";--> statement-breakpoint
ALTER TABLE "grade_submissions" DROP CONSTRAINT "grade_submissions_teacher_id_subject_id_class_id_semester_id_un";--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN "tenant_id" integer;--> statement-breakpoint
ALTER TABLE "teaching_units" ADD COLUMN "tenant_id" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "tenant_id" integer;--> statement-breakpoint
ALTER TABLE "semesters" ADD COLUMN "tenant_id" integer;--> statement-breakpoint
ALTER TABLE "semesters" ADD COLUMN "class_id" integer;--> statement-breakpoint
ALTER TABLE "semesters" ADD COLUMN "semester_number" integer;--> statement-breakpoint
ALTER TABLE "semesters" ADD COLUMN "niveau_lmd" varchar(10);--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN "tenant_id" integer;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "tenant_id" integer;--> statement-breakpoint
ALTER TABLE "blocked_dates" ADD COLUMN "tenant_id" integer;--> statement-breakpoint
ALTER TABLE "payment_installments" ADD COLUMN "schedule_installment_id" integer;--> statement-breakpoint
ALTER TABLE "teacher_honoraria" ADD COLUMN "hourly_rate" real;--> statement-breakpoint
ALTER TABLE "teacher_payments" ADD COLUMN "payment_method" varchar(50) DEFAULT 'especes';--> statement-breakpoint
ALTER TABLE "housing_buildings" ADD COLUMN "tenant_id" integer;--> statement-breakpoint
ALTER TABLE "retake_sessions" ADD COLUMN "tenant_id" integer;--> statement-breakpoint
ALTER TABLE "activation_keys" ADD COLUMN "tenant_id" integer;--> statement-breakpoint
ALTER TABLE "special_jury_sessions" ADD COLUMN "tenant_id" integer;--> statement-breakpoint
ALTER TABLE "evaluation_periods" ADD COLUMN "tenant_id" integer;--> statement-breakpoint
ALTER TABLE "reclamation_periods" ADD COLUMN "tenant_id" integer;--> statement-breakpoint
ALTER TABLE "payment_schedule_installments" ADD CONSTRAINT "payment_schedule_installments_schedule_id_payment_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."payment_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_schedules" ADD CONSTRAINT "payment_schedules_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_downloads" ADD CONSTRAINT "library_downloads_resource_id_library_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."library_resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_downloads" ADD CONSTRAINT "library_downloads_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_quiz_questions" ADD CONSTRAINT "library_quiz_questions_quiz_id_library_quiz_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."library_quiz"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_quiz_reponses" ADD CONSTRAINT "library_quiz_reponses_question_id_library_quiz_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."library_quiz_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_quiz_resultats" ADD CONSTRAINT "library_quiz_resultats_quiz_id_library_quiz_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."library_quiz"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_quiz_resultats" ADD CONSTRAINT "library_quiz_resultats_etudiant_id_users_id_fk" FOREIGN KEY ("etudiant_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_quiz" ADD CONSTRAINT "library_quiz_resource_id_library_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."library_resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_quiz" ADD CONSTRAINT "library_quiz_cree_par_users_id_fk" FOREIGN KEY ("cree_par") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_resources" ADD CONSTRAINT "library_resources_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_resources" ADD CONSTRAINT "library_resources_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_resources" ADD CONSTRAINT "library_resources_semester_id_semesters_id_fk" FOREIGN KEY ("semester_id") REFERENCES "public"."semesters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_resources" ADD CONSTRAINT "library_resources_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_time_tracking" ADD CONSTRAINT "library_time_tracking_resource_id_library_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."library_resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_time_tracking" ADD CONSTRAINT "library_time_tracking_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webauthn_credentials" ADD CONSTRAINT "webauthn_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_units" ADD CONSTRAINT "teaching_units_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "semesters" ADD CONSTRAINT "semesters_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "semesters" ADD CONSTRAINT "semesters_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocked_dates" ADD CONSTRAINT "blocked_dates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_installments" ADD CONSTRAINT "payment_installments_schedule_installment_id_payment_schedule_installments_id_fk" FOREIGN KEY ("schedule_installment_id") REFERENCES "public"."payment_schedule_installments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "housing_buildings" ADD CONSTRAINT "housing_buildings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retake_sessions" ADD CONSTRAINT "retake_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activation_keys" ADD CONSTRAINT "activation_keys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "special_jury_sessions" ADD CONSTRAINT "special_jury_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_periods" ADD CONSTRAINT "evaluation_periods_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reclamation_periods" ADD CONSTRAINT "reclamation_periods_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_tenant_unique" UNIQUE("email","tenant_id");--> statement-breakpoint
ALTER TABLE "semesters" ADD CONSTRAINT "unique_semester_class_year" UNIQUE("class_id","academic_year","semester_number");--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_teacher_id_subject_id_class_id_session_date_unique" UNIQUE("teacher_id","subject_id","class_id","session_date");--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_teacher_id_subject_id_class_id_session_date_student_id_unique" UNIQUE("teacher_id","subject_id","class_id","session_date","student_id");--> statement-breakpoint
ALTER TABLE "grade_submissions" ADD CONSTRAINT "grade_submissions_teacher_id_subject_id_class_id_semester_id_unique" UNIQUE("teacher_id","subject_id","class_id","semester_id");