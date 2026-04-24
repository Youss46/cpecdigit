import { useMutation, useQuery } from "@tanstack/react-query";
import type { UseMutationOptions, UseQueryOptions } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

type QueryOpts<T> = Omit<UseQueryOptions<T, Error>, "queryKey" | "queryFn">;

// ─── Types for planning assignments (volume horaire) ──────────────────────────

export type PlanningAssignment = {
  id: number;
  teacherId: number;
  teacherName: string;
  subjectId: number;
  subjectName: string;
  classId: number;
  className: string;
  semesterId: number;
  semesterName: string;
  plannedHours: number;
  completedHours: number;
  createdAt: string;
};

export type CreatePlanningAssignmentRequest = {
  teacherId: number;
  subjectId: number;
  classId: number;
  semesterId: number;
  plannedHours?: number;
};

export type BlockedDate = {
  id: number;
  date: string;
  dateEnd?: string | null;
  reason: string;
  type: "vacances" | "ferie" | "autre";
  createdAt: string;
};

export type CreateBlockedDateRequest = {
  date: string;
  dateEnd?: string | null;
  reason: string;
  type?: "vacances" | "ferie" | "autre";
};

export type PublishScheduleRequest = {
  semesterId: number;
  published: boolean;
  classId?: number;
};

export type PublishPeriod = "today" | "1week" | "2weeks" | "1month";

export type PublishSchedulePeriodRequest = {
  classId: number;
  semesterId: number;
  period: PublishPeriod;
};

export type SchedulePublication = {
  id: number;
  classId: number;
  semesterId: number;
  publishedFrom: string;
  publishedUntil: string;
  publishedAt: string;
};

export type UpdateScheduleEntryRequest = {
  teacherId: number;
  subjectId: number;
  classId: number;
  roomId: number;
  sessionDate: string;
  startTime: string;
  endTime: string;
  notes?: string | null;
};

// ─── Planning Assignments ─────────────────────────────────────────────────────

export const listPlanningAssignments = (): Promise<PlanningAssignment[]> =>
  customFetch<PlanningAssignment[]>("/api/admin/teacher-assignments");

export const useListPlanningAssignments = (options?: QueryOpts<PlanningAssignment[]>) =>
  useQuery<PlanningAssignment[]>({
    queryKey: ["/api/admin/teacher-assignments"],
    queryFn: listPlanningAssignments,
    ...options,
  });

export const createPlanningAssignment = (data: CreatePlanningAssignmentRequest): Promise<PlanningAssignment> =>
  customFetch<PlanningAssignment>("/api/admin/teacher-assignments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

export const useCreatePlanningAssignment = (options?: UseMutationOptions<PlanningAssignment, unknown, CreatePlanningAssignmentRequest>) =>
  useMutation<PlanningAssignment, unknown, CreatePlanningAssignmentRequest>({
    mutationKey: ["createPlanningAssignment"],
    mutationFn: createPlanningAssignment,
    ...options,
  });

export const updatePlanningAssignment = ({ id, plannedHours }: { id: number; plannedHours: number }): Promise<PlanningAssignment> =>
  customFetch<PlanningAssignment>(`/api/admin/teacher-assignments/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plannedHours }),
  });

export const useUpdatePlanningAssignment = (options?: UseMutationOptions<PlanningAssignment, unknown, { id: number; plannedHours: number }>) =>
  useMutation<PlanningAssignment, unknown, { id: number; plannedHours: number }>({
    mutationKey: ["updatePlanningAssignment"],
    mutationFn: updatePlanningAssignment,
    ...options,
  });

export const deletePlanningAssignment = ({ id }: { id: number }): Promise<{ message: string }> =>
  customFetch<{ message: string }>(`/api/admin/teacher-assignments/${id}`, { method: "DELETE" });

export const useDeletePlanningAssignment = (options?: UseMutationOptions<{ message: string }, unknown, { id: number }>) =>
  useMutation<{ message: string }, unknown, { id: number }>({
    mutationKey: ["deletePlanningAssignment"],
    mutationFn: deletePlanningAssignment,
    ...options,
  });

// ─── Blocked Dates ─────────────────────────────────────────────────────────────

export const listBlockedDates = (): Promise<BlockedDate[]> =>
  customFetch<BlockedDate[]>("/api/admin/blocked-dates");

export const useListBlockedDates = (options?: QueryOpts<BlockedDate[]>) =>
  useQuery<BlockedDate[]>({
    queryKey: ["/api/admin/blocked-dates"],
    queryFn: listBlockedDates,
    ...options,
  });

export const createBlockedDate = (data: CreateBlockedDateRequest): Promise<BlockedDate> =>
  customFetch<BlockedDate>("/api/admin/blocked-dates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

export const useCreateBlockedDate = (options?: UseMutationOptions<BlockedDate, unknown, CreateBlockedDateRequest>) =>
  useMutation<BlockedDate, unknown, CreateBlockedDateRequest>({
    mutationKey: ["createBlockedDate"],
    mutationFn: createBlockedDate,
    ...options,
  });

export const deleteBlockedDate = ({ id }: { id: number }): Promise<{ message: string }> =>
  customFetch<{ message: string }>(`/api/admin/blocked-dates/${id}`, { method: "DELETE" });

export const useDeleteBlockedDate = (options?: UseMutationOptions<{ message: string }, unknown, { id: number }>) =>
  useMutation<{ message: string }, unknown, { id: number }>({
    mutationKey: ["deleteBlockedDate"],
    mutationFn: deleteBlockedDate,
    ...options,
  });

// ─── Schedule Publish ─────────────────────────────────────────────────────────

export const publishSchedule = (data: PublishScheduleRequest): Promise<{ message: string }> =>
  customFetch<{ message: string }>("/api/admin/schedules/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

export const usePublishSchedule = (options?: UseMutationOptions<{ message: string }, unknown, PublishScheduleRequest>) =>
  useMutation<{ message: string }, unknown, PublishScheduleRequest>({
    mutationKey: ["publishSchedule"],
    mutationFn: publishSchedule,
    ...options,
  });

// ─── Schedule Publish Period ──────────────────────────────────────────────────

export const publishSchedulePeriod = (data: PublishSchedulePeriodRequest): Promise<{ message: string; publication: SchedulePublication }> =>
  customFetch<{ message: string; publication: SchedulePublication }>("/api/admin/schedules/publish-period", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

export const usePublishSchedulePeriod = (options?: UseMutationOptions<{ message: string; publication: SchedulePublication }, unknown, PublishSchedulePeriodRequest>) =>
  useMutation<{ message: string; publication: SchedulePublication }, unknown, PublishSchedulePeriodRequest>({
    mutationKey: ["publishSchedulePeriod"],
    mutationFn: publishSchedulePeriod,
    ...options,
  });

export const listSchedulePublications = (params?: { classId?: number; semesterId?: number }): Promise<SchedulePublication[]> => {
  const qs = new URLSearchParams();
  if (params?.classId) qs.set("classId", String(params.classId));
  if (params?.semesterId) qs.set("semesterId", String(params.semesterId));
  return customFetch<SchedulePublication[]>(`/api/admin/schedules/publications${qs.toString() ? "?" + qs.toString() : ""}`);
};

export const useListSchedulePublications = (params?: { classId?: number; semesterId?: number }, options?: QueryOpts<SchedulePublication[]>) =>
  useQuery<SchedulePublication[]>({
    queryKey: ["/api/admin/schedules/publications", params],
    queryFn: () => listSchedulePublications(params),
    ...options,
  });

// ─── Subject Approvals ────────────────────────────────────────────────────────

export type SubjectApproval = {
  id: number;
  subjectId: number;
  subjectName: string;
  classId: number;
  className: string;
  semesterId: number;
  approvedById: number;
  approvedByName: string;
  approvedAt: string;
};

export type ApproveSubjectRequest = {
  subjectId: number;
  classId: number;
  semesterId: number;
};

export const listSubjectApprovals = (params?: { semesterId?: number; classId?: number }): Promise<SubjectApproval[]> => {
  const qs = new URLSearchParams();
  if (params?.semesterId) qs.set("semesterId", String(params.semesterId));
  if (params?.classId) qs.set("classId", String(params.classId));
  return customFetch<SubjectApproval[]>(`/api/admin/subject-approvals${qs.toString() ? "?" + qs.toString() : ""}`);
};

export const useListSubjectApprovals = (params?: { semesterId?: number; classId?: number }, options?: QueryOpts<SubjectApproval[]>) =>
  useQuery<SubjectApproval[]>({
    queryKey: ["/api/admin/subject-approvals", params],
    queryFn: () => listSubjectApprovals(params),
    ...options,
  });

export const approveSubject = (data: ApproveSubjectRequest): Promise<SubjectApproval> =>
  customFetch<SubjectApproval>("/api/admin/subject-approvals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

export const useApproveSubject = (options?: UseMutationOptions<SubjectApproval, unknown, ApproveSubjectRequest>) =>
  useMutation<SubjectApproval, unknown, ApproveSubjectRequest>({
    mutationKey: ["approveSubject"],
    mutationFn: approveSubject,
    ...options,
  });

export const unapproveSubject = ({ id }: { id: number }): Promise<{ message: string }> =>
  customFetch<{ message: string }>(`/api/admin/subject-approvals/${id}`, { method: "DELETE" });

export const useUnapproveSubject = (options?: UseMutationOptions<{ message: string }, unknown, { id: number }>) =>
  useMutation<{ message: string }, unknown, { id: number }>({
    mutationKey: ["unapproveSubject"],
    mutationFn: unapproveSubject,
    ...options,
  });

// ─── Grade Submissions ────────────────────────────────────────────────────────

export type GradeSubmission = {
  id: number;
  teacherId: number;
  teacherName: string;
  subjectId: number;
  subjectName: string;
  classId: number;
  className: string;
  semesterId: number;
  submittedAt: string;
};

export type SubmitGradesRequest = { subjectId: number; classId: number; semesterId: number };

export const submitGradesForReview = (data: SubmitGradesRequest): Promise<{ message: string }> =>
  customFetch<{ message: string }>("/api/teacher/grade-submissions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

export const useSubmitGradesForReview = (options?: UseMutationOptions<{ message: string }, unknown, SubmitGradesRequest>) =>
  useMutation<{ message: string }, unknown, SubmitGradesRequest>({
    mutationKey: ["submitGradesForReview"],
    mutationFn: submitGradesForReview,
    ...options,
  });

export const sendGradesToStudents = (data: SubmitGradesRequest): Promise<{ message: string; notifiedCount: number }> =>
  customFetch<{ message: string; notifiedCount: number }>("/api/teacher/grade-submissions/notify-students", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

export const useSendGradesToStudents = (options?: UseMutationOptions<{ message: string; notifiedCount: number }, unknown, SubmitGradesRequest>) =>
  useMutation<{ message: string; notifiedCount: number }, unknown, SubmitGradesRequest>({
    mutationKey: ["sendGradesToStudents"],
    mutationFn: sendGradesToStudents,
    ...options,
  });

export const getGradeSubmissionStatus = (params: SubmitGradesRequest): Promise<{ submitted: boolean; submittedAt: string | null }> => {
  const qs = new URLSearchParams({
    subjectId: String(params.subjectId),
    classId: String(params.classId),
    semesterId: String(params.semesterId),
  });
  return customFetch(`/api/teacher/grade-submissions/status?${qs.toString()}`);
};

export const useGetGradeSubmissionStatus = (params: SubmitGradesRequest | null, options?: QueryOpts<{ submitted: boolean; submittedAt: string | null }>) =>
  useQuery<{ submitted: boolean; submittedAt: string | null }>({
    queryKey: ["/api/teacher/grade-submissions/status", params],
    queryFn: () => getGradeSubmissionStatus(params!),
    enabled: !!params,
    ...options,
  });

export const getPendingGradeSubmissions = (params?: { semesterId?: number }): Promise<GradeSubmission[]> => {
  const qs = new URLSearchParams();
  if (params?.semesterId) qs.set("semesterId", String(params.semesterId));
  return customFetch<GradeSubmission[]>(`/api/admin/grade-submissions/pending${qs.toString() ? "?" + qs.toString() : ""}`);
};

export const useGetPendingGradeSubmissions = (params?: { semesterId?: number }, options?: QueryOpts<GradeSubmission[]>) =>
  useQuery<GradeSubmission[]>({
    queryKey: ["/api/admin/grade-submissions/pending", params],
    queryFn: () => getPendingGradeSubmissions(params),
    refetchInterval: 30000,
    ...options,
  });

export const getPendingGradeSubmissionsCount = (): Promise<{ count: number }> =>
  customFetch<{ count: number }>("/api/admin/grade-submissions/pending-count");

export const useGetPendingGradeSubmissionsCount = (options?: QueryOpts<{ count: number }>) =>
  useQuery<{ count: number }>({
    queryKey: ["/api/admin/grade-submissions/pending-count"],
    queryFn: getPendingGradeSubmissionsCount,
    refetchInterval: 30000,
    ...options,
  });

// ─── Teacher Approvals ────────────────────────────────────────────────────────

export type TeacherApproval = {
  subjectId: number;
  classId: number;
  semesterId: number;
  approvedByName: string | null;
  approvedAt: string | null;
};

const getTeacherApprovals = (): Promise<TeacherApproval[]> =>
  customFetch<TeacherApproval[]>("/api/teacher/approvals");

export const useGetTeacherApprovals = (options?: QueryOpts<TeacherApproval[]>) =>
  useQuery<TeacherApproval[]>({
    queryKey: ["/api/teacher/approvals"],
    queryFn: getTeacherApprovals,
    refetchInterval: 30000,
    ...options,
  });

// ─── Derogation ───────────────────────────────────────────────────────────────

export type DerogateGradeRequest = {
  studentId: number;
  subjectId: number;
  semesterId: number;
  value: number;
  justification: string;
};

export const derogateGrade = (data: DerogateGradeRequest): Promise<{ message: string }> =>
  customFetch<{ message: string }>("/api/admin/grades/derogate", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

export const useDerogateGrade = (options?: UseMutationOptions<{ message: string }, unknown, DerogateGradeRequest>) =>
  useMutation<{ message: string }, unknown, DerogateGradeRequest>({
    mutationKey: ["derogateGrade"],
    mutationFn: derogateGrade,
    ...options,
  });

// ─── Activity Log ─────────────────────────────────────────────────────────────

export type ActivityLogEntry = {
  id: number;
  userId: number;
  userName: string;
  action: string;
  details: string | null;
  createdAt: string;
};

export const listActivityLog = (): Promise<ActivityLogEntry[]> =>
  customFetch<ActivityLogEntry[]>("/api/admin/activity-log");

export const useListActivityLog = (options?: QueryOpts<ActivityLogEntry[]>) =>
  useQuery<ActivityLogEntry[]>({
    queryKey: ["/api/admin/activity-log"],
    queryFn: listActivityLog,
    ...options,
  });

// ─── Move Class (reorder) ─────────────────────────────────────────────────────

export const moveClass = ({ id, direction }: { id: number; direction: "up" | "down" }): Promise<{ message: string }> =>
  customFetch<{ message: string }>(`/api/admin/classes/${id}/move`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ direction }),
  });

export const useMoveClass = (options?: UseMutationOptions<{ message: string }, unknown, { id: number; direction: "up" | "down" }>) =>
  useMutation<{ message: string }, unknown, { id: number; direction: "up" | "down" }>({
    mutationKey: ["moveClass"],
    mutationFn: moveClass,
    ...options,
  });

// ─── Promote Admitted Students ────────────────────────────────────────────────

export type PromoteRequest = { semesterId: number; classId: number };
export type PromoteResponse = { promoted: { id: number; name: string }[]; fromClass: string; toClassId: number };

export const promoteAdmitted = (data: PromoteRequest): Promise<PromoteResponse> =>
  customFetch<PromoteResponse>(`/api/admin/semesters/${data.semesterId}/promote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ classId: data.classId }),
  });

export const usePromoteAdmitted = (options?: UseMutationOptions<PromoteResponse, unknown, PromoteRequest>) =>
  useMutation<PromoteResponse, unknown, PromoteRequest>({
    mutationKey: ["promoteAdmitted"],
    mutationFn: promoteAdmitted,
    ...options,
  });

// ─── Update Class Config (next class) ────────────────────────────────────────

export type UpdateClassConfigRequest = { id: number; name?: string; description?: string; nextClassId?: number | null; isTerminal?: boolean; filiere?: string | null };

export const updateClassConfig = ({ id, ...data }: UpdateClassConfigRequest): Promise<any> =>
  customFetch<any>(`/api/admin/classes/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

export const useUpdateClassConfig = (options?: UseMutationOptions<any, unknown, UpdateClassConfigRequest>) =>
  useMutation<any, unknown, UpdateClassConfigRequest>({
    mutationKey: ["updateClassConfig"],
    mutationFn: updateClassConfig,
    ...options,
  });

// ─── Schedule Entry Update ─────────────────────────────────────────────────────

export const updateScheduleEntry = ({ entryId, data }: { entryId: number; data: UpdateScheduleEntryRequest }): Promise<any> =>
  customFetch<any>(`/api/admin/schedules/${entryId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

export const useUpdateScheduleEntry = (options?: UseMutationOptions<any, unknown, { entryId: number; data: UpdateScheduleEntryRequest }>) =>
  useMutation<any, unknown, { entryId: number; data: UpdateScheduleEntryRequest }>({
    mutationKey: ["updateScheduleEntry"],
    mutationFn: updateScheduleEntry,
    ...options,
  });

// ─── Teacher Schedule ─────────────────────────────────────────────────────────

export type TeacherScheduleEntry = {
  id: number;
  teacherId: number;
  teacherName: string;
  subjectId: number;
  subjectName: string;
  classId: number;
  className: string;
  roomId: number;
  roomName: string;
  semesterId: number;
  semesterName: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  notes: string | null;
  published: boolean;
  createdAt: string;
};

const getTeacherSchedule = (): Promise<TeacherScheduleEntry[]> =>
  customFetch<TeacherScheduleEntry[]>("/api/teacher/schedule");

export const useGetTeacherSchedule = (options?: QueryOpts<TeacherScheduleEntry[]>) =>
  useQuery<TeacherScheduleEntry[], Error>({
    queryKey: ["teacherSchedule"],
    queryFn: getTeacherSchedule,
    ...options,
  });

// ─── Student Me ───────────────────────────────────────────────────────────────

export type StudentMe = {
  id: number;
  name: string;
  email: string;
  classId: number | null;
  className: string | null;
};

const getStudentMe = (): Promise<StudentMe> =>
  customFetch("/api/student/me");

export const useGetStudentMe = (options?: QueryOpts<StudentMe>) =>
  useQuery<StudentMe, Error>({
    queryKey: ["studentMe"],
    queryFn: getStudentMe,
    ...options,
  });

// ─── Notifications ────────────────────────────────────────────────────────────

export type AppNotification = {
  id: number;
  userId: number;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
};

const getNotifications = (): Promise<AppNotification[]> =>
  customFetch("/api/notifications");

export const useGetNotifications = (options?: QueryOpts<AppNotification[]>) =>
  useQuery<AppNotification[], Error>({
    queryKey: ["notifications"],
    queryFn: getNotifications,
    refetchInterval: 30000, // poll every 30s
    ...options,
  });

const getUnreadCount = (): Promise<{ count: number }> =>
  customFetch("/api/notifications/unread-count");

export const useGetUnreadNotificationCount = (options?: QueryOpts<{ count: number }>) =>
  useQuery<{ count: number }, Error>({
    queryKey: ["notifications", "unread-count"],
    queryFn: getUnreadCount,
    refetchInterval: 30000,
    ...options,
  });

const markNotificationRead = (id: number): Promise<{ ok: boolean }> =>
  customFetch(`/api/notifications/${id}/read`, { method: "PATCH" });

export const useMarkNotificationRead = () =>
  useMutation<{ ok: boolean }, Error, number>({
    mutationFn: markNotificationRead,
  });

const markAllRead = (): Promise<{ ok: boolean }> =>
  customFetch("/api/notifications/read-all", { method: "POST" });

export const useMarkAllNotificationsRead = () =>
  useMutation<{ ok: boolean }, Error, void>({
    mutationFn: markAllRead,
  });

// ─── Scolarité / Payments ─────────────────────────────────────────────────────

export type StudentFeeRow = {
  id: number;
  name: string;
  email: string;
  classId: number | null;
  className: string | null;
  feeId: number | null;
  totalAmount: number;
  totalPaid: number;
  remaining: number;
  academicYear: string | null;
  notes: string | null;
  status: "paid" | "partial" | "unpaid";
};

export type ScolariteStats = {
  totalExpected: number;
  totalPaid: number;
  totalRemaining: number;
  recoveryRate: number;
  studentCount: number;
  fullyPaid: number;
  partial: number;
  noPay: number;
};

export type StudentPayment = {
  id: number;
  studentId: number;
  amount: number;
  description: string | null;
  paymentDate: string;
  createdAt: string;
  recordedByName: string | null;
};

const getScolariteStudents = (): Promise<StudentFeeRow[]> =>
  customFetch("/api/scolarite/students");

export const useGetScolariteStudents = (options?: QueryOpts<StudentFeeRow[]>) =>
  useQuery<StudentFeeRow[], Error>({
    queryKey: ["scolarite", "students"],
    queryFn: getScolariteStudents,
    ...options,
  });

const getScolariteStats = (): Promise<ScolariteStats> =>
  customFetch("/api/scolarite/stats");

export const useGetScolariteStats = (options?: QueryOpts<ScolariteStats>) =>
  useQuery<ScolariteStats, Error>({
    queryKey: ["scolarite", "stats"],
    queryFn: getScolariteStats,
    ...options,
  });

const getStudentPayments = (studentId: number): Promise<StudentPayment[]> =>
  customFetch(`/api/scolarite/payments/${studentId}`);

export const useGetStudentPayments = (studentId: number, options?: QueryOpts<StudentPayment[]>) =>
  useQuery<StudentPayment[], Error>({
    queryKey: ["scolarite", "payments", studentId],
    queryFn: () => getStudentPayments(studentId),
    enabled: studentId > 0,
    ...options,
  });

type SetFeeInput = { studentId: number; totalAmount: number; academicYear?: string; notes?: string };
const setStudentFee = ({ studentId, ...body }: SetFeeInput): Promise<any> =>
  customFetch(`/api/scolarite/fees/${studentId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const useSetStudentFee = () =>
  useMutation<any, Error, SetFeeInput>({ mutationFn: setStudentFee });

type AddPaymentInput = { studentId: number; amount: number; description?: string; paymentDate: string };
const addPayment = (body: AddPaymentInput): Promise<StudentPayment> =>
  customFetch("/api/scolarite/payments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const useAddPayment = () =>
  useMutation<StudentPayment, Error, AddPaymentInput>({ mutationFn: addPayment });

const deletePayment = (id: number): Promise<{ ok: boolean }> =>
  customFetch(`/api/scolarite/payments/${id}`, { method: "DELETE" });

export const useDeletePayment = () =>
  useMutation<{ ok: boolean }, Error, number>({ mutationFn: deletePayment });

// ─── Honoraires (Teacher Payments) ───────────────────────────────────────────

export type TeacherHonorariumRow = {
  id: number;
  name: string;
  email: string;
  honorariumId: number | null;
  totalAmount: number;
  totalPaid: number;
  remaining: number;
  periodLabel: string | null;
  notes: string | null;
  status: "paid" | "partial" | "unpaid";
};

export type HonorairesStats = {
  totalExpected: number;
  totalPaid: number;
  totalRemaining: number;
  recoveryRate: number;
  teacherCount: number;
  fullyPaid: number;
  partial: number;
  noPay: number;
};

export type TeacherPayment = {
  id: number;
  teacherId: number;
  amount: number;
  description: string | null;
  paymentDate: string;
  createdAt: string;
  recordedByName: string | null;
};

export const useGetHonorairesTeachers = (options?: QueryOpts<TeacherHonorariumRow[]>) =>
  useQuery<TeacherHonorariumRow[], Error>({
    queryKey: ["honoraires", "teachers"],
    queryFn: () => customFetch("/api/honoraires/teachers"),
    ...options,
  });

export const useGetHonorairesStats = (options?: QueryOpts<HonorairesStats>) =>
  useQuery<HonorairesStats, Error>({
    queryKey: ["honoraires", "stats"],
    queryFn: () => customFetch("/api/honoraires/stats"),
    ...options,
  });

export const useGetTeacherPayments = (teacherId: number, options?: QueryOpts<TeacherPayment[]>) =>
  useQuery<TeacherPayment[], Error>({
    queryKey: ["honoraires", "payments", teacherId],
    queryFn: () => customFetch(`/api/honoraires/payments/${teacherId}`),
    enabled: teacherId > 0,
    ...options,
  });

type SetTeacherFeeInput = { teacherId: number; totalAmount: number; periodLabel?: string; notes?: string };
export const useSetTeacherHonorarium = () =>
  useMutation<any, Error, SetTeacherFeeInput>({
    mutationFn: ({ teacherId, ...body }) =>
      customFetch(`/api/honoraires/fees/${teacherId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });

type AddTeacherPaymentInput = { teacherId: number; amount: number; description?: string; paymentDate: string };
export const useAddTeacherPayment = () =>
  useMutation<TeacherPayment, Error, AddTeacherPaymentInput>({
    mutationFn: (body) => customFetch("/api/honoraires/payments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });

export const useDeleteTeacherPayment = () =>
  useMutation<{ ok: boolean }, Error, number>({
    mutationFn: (id) => customFetch(`/api/honoraires/payments/${id}`, { method: "DELETE" }),
  });

// ─── Annual Promotion ─────────────────────────────────────────────────────────

export type AnnualPromotionStudentPreview = {
  id: number;
  name: string;
  decision: "Admis" | "Ajourné" | "En attente";
  semesterDecisions: string[];
};

export type AnnualPromotionClassPreview = {
  classId: number;
  className: string;
  nextClassId: number | null;
  nextClassName: string;
  students: AnnualPromotionStudentPreview[];
  admittedCount: number;
  deferredCount: number;
  pendingCount: number;
};

export type AnnualPromotionPreviewResponse = {
  academicYear: string;
  semesters: string[];
  classes: AnnualPromotionClassPreview[];
};

export type AnnualPromotionResult = {
  classId: number;
  className: string;
  nextClassId: number;
  nextClassName: string;
  promoted: { id: number; name: string }[];
  notPromoted: { name: string; reason: string }[];
};

export type AnnualPromotionResponse = {
  academicYear: string;
  results: AnnualPromotionResult[];
  totalPromoted: number;
};

export const useGetAnnualPromotionPreview = (academicYear: string, options?: QueryOpts<AnnualPromotionPreviewResponse>) =>
  useQuery<AnnualPromotionPreviewResponse, Error>({
    queryKey: ["annual-promotion-preview", academicYear],
    queryFn: () => customFetch<AnnualPromotionPreviewResponse>(`/api/admin/annual-promotion/preview?academicYear=${encodeURIComponent(academicYear)}`),
    enabled: !!academicYear,
    ...options,
  });

export const useLaunchAnnualPromotion = (options?: UseMutationOptions<AnnualPromotionResponse, Error, { academicYear: string }>) =>
  useMutation<AnnualPromotionResponse, Error, { academicYear: string }>({
    mutationFn: (body) =>
      customFetch<AnnualPromotionResponse>("/api/admin/annual-promotion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    ...options,
  });

export type RollbackRequest = { academicYear: string; results: AnnualPromotionResult[] };
export type RollbackResponse = { ok: boolean; totalReverted: number; academicYear: string };

export const useRollbackAnnualPromotion = (options?: UseMutationOptions<RollbackResponse, Error, RollbackRequest>) =>
  useMutation<RollbackResponse, Error, RollbackRequest>({
    mutationFn: (body) =>
      customFetch<RollbackResponse>("/api/admin/annual-promotion/rollback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    ...options,
  });

// ─── Archives ─────────────────────────────────────────────────────────────────

export interface AcademicYearArchive {
  id: number;
  academicYear: string;
  archivedAt: string;
  archivedById: number | null;
  newAcademicYear: string | null;
  initializedAt: string | null;
  initializedById: number | null;
}

export interface ArchiveDetailGrade {
  studentId: number;
  semesterId: number;
  average: number | null;
  decision: string | null;
}

export interface ArchiveDetailEnrollment {
  studentId: number;
  studentName: string;
  classId: number;
  className: string;
}

export interface ArchiveDetailResponse {
  archive: AcademicYearArchive;
  semesters: { id: number; name: string; academicYear: string; published: boolean }[];
  classes: { id: number; name: string }[];
  enrollments: ArchiveDetailEnrollment[];
  grades: ArchiveDetailGrade[];
}

export const useGetArchives = (options?: QueryOpts<AcademicYearArchive[]>) =>
  useQuery<AcademicYearArchive[], Error>({
    queryKey: ["/api/admin/archives"],
    queryFn: () => customFetch<AcademicYearArchive[]>("/api/admin/archives"),
    ...options,
  });

export const useGetArchiveDetail = (academicYear: string, options?: QueryOpts<ArchiveDetailResponse>) =>
  useQuery<ArchiveDetailResponse, Error>({
    queryKey: ["/api/admin/archives", academicYear],
    queryFn: () => customFetch<ArchiveDetailResponse>(`/api/admin/archives/${encodeURIComponent(academicYear)}`),
    enabled: !!academicYear,
    ...options,
  });

export const useArchiveYear = (options?: UseMutationOptions<AcademicYearArchive, Error, { academicYear: string }>) =>
  useMutation<AcademicYearArchive, Error, { academicYear: string }>({
    mutationFn: (body) =>
      customFetch<AcademicYearArchive>("/api/admin/annual-promotion/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    ...options,
  });

export type InitializeYearRequest = { fromAcademicYear: string; toAcademicYear: string };
export type InitializeYearResponse = { ok: boolean; toAcademicYear: string; semestersCreated: number; semesters: { id: number; name: string }[] };

export const useInitializeYear = (options?: UseMutationOptions<InitializeYearResponse, Error, InitializeYearRequest>) =>
  useMutation<InitializeYearResponse, Error, InitializeYearRequest>({
    mutationFn: (body) =>
      customFetch<InitializeYearResponse>("/api/admin/annual-promotion/initialize-year", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    ...options,
  });

// ─── Messages: unread count ──────────────────────────────────────────────────

export const useGetUnreadMessageCount = (options?: QueryOpts<{ count: number }>) =>
  useQuery<{ count: number }, Error>({
    queryKey: ["/api/messages/unread/count"],
    queryFn: () => customFetch<{ count: number }>("/api/messages/unread/count"),
    refetchInterval: 30_000,
    ...options,
  });

// ─── Teacher Attendance History ──────────────────────────────────────────────

export const useTeacherAttendanceHistory = (options?: QueryOpts<any[]>) =>
  useQuery<any[], Error>({
    queryKey: ["/api/teacher/attendance/history"],
    queryFn: () => customFetch<any[]>("/api/teacher/attendance/history"),
    ...options,
  });

// ─── Absence Justifications (student) ────────────────────────────────────────

export const useMyJustifications = (options?: QueryOpts<any[]>) =>
  useQuery<any[], Error>({
    queryKey: ["/api/student/justifications"],
    queryFn: () => customFetch<any[]>("/api/student/justifications"),
    ...options,
  });

export const useSubmitJustification = (options?: UseMutationOptions<any, unknown, { attendanceId: number; reason: string }>) =>
  useMutation<any, unknown, { attendanceId: number; reason: string }>({
    mutationKey: ["submitJustification"],
    mutationFn: (body) =>
      customFetch<any>("/api/student/justifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    ...options,
  });

// ─── Absence Justifications (admin) ──────────────────────────────────────────

export const useAdminJustifications = (params?: { status?: string }, options?: QueryOpts<any[]>) =>
  useQuery<any[], Error>({
    queryKey: ["/api/admin/justifications", params],
    queryFn: () => {
      const q = params?.status ? `?status=${params.status}` : "";
      return customFetch<any[]>(`/api/admin/justifications${q}`);
    },
    ...options,
  });

export const useReviewJustification = (options?: UseMutationOptions<any, unknown, { id: number; status: "approved" | "rejected"; reviewNote?: string }>) =>
  useMutation<any, unknown, { id: number; status: "approved" | "rejected"; reviewNote?: string }>({
    mutationKey: ["reviewJustification"],
    mutationFn: ({ id, ...body }) =>
      customFetch<any>(`/api/admin/justifications/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    ...options,
  });

// ─── Teacher Students per Class ───────────────────────────────────────────────

export const useGetTeacherStudents = (params?: { classId?: number; semesterId?: number }, options?: QueryOpts<any[]>) =>
  useQuery<any[], Error>({
    queryKey: ["/api/teacher/students", params],
    queryFn: () => {
      const q = new URLSearchParams();
      if (params?.classId) q.set("classId", String(params.classId));
      if (params?.semesterId) q.set("semesterId", String(params.semesterId));
      const qs = q.toString() ? `?${q.toString()}` : "";
      return customFetch<any[]>(`/api/teacher/students${qs}`);
    },
    ...options,
  });

// ─── Admin Student Detail ─────────────────────────────────────────────────────

export const useGetAdminStudentDetail = (studentId: number, options?: QueryOpts<any>) =>
  useQuery<any, Error>({
    queryKey: ["/api/admin/students/detail", studentId],
    queryFn: () => customFetch<any>(`/api/admin/students/${studentId}/detail`),
    enabled: !!studentId,
    ...options,
  });

// ─── Teacher Student Detail ───────────────────────────────────────────────────

export const useGetTeacherStudentDetail = (studentId: number, options?: QueryOpts<any>) =>
  useQuery<any, Error>({
    queryKey: ["/api/teacher/students/detail", studentId],
    queryFn: () => customFetch<any>(`/api/teacher/students/${studentId}`),
    enabled: !!studentId,
    ...options,
  });

// ─── Student Balance ──────────────────────────────────────────────────────────

export type StudentBalance = {
  totalDue: number;
  totalPaid: number;
  remaining: number;
  academicYear: string | null;
  status: "non_configure" | "solde" | "partiel" | "impaye";
  payments: {
    id: number;
    amount: number;
    description: string | null;
    paymentDate: string;
    recordedByName: string | null;
  }[];
};

export const useGetStudentBalance = (options?: QueryOpts<StudentBalance>) =>
  useQuery<StudentBalance, Error>({
    queryKey: ["/api/student/balance"],
    queryFn: () => customFetch<StudentBalance>("/api/student/balance"),
    ...options,
  });

// ── Jury Spécial ──────────────────────────────────────────────────────────────

export type SpecialJurySession = {
  id: number;
  academicYear: string;
  status: "active" | "closed";
  activatedBy: number | null;
  closedAt: string | null;
  notes: string | null;
  createdAt: string;
};

export type JurySemesterResult = {
  semesterId: number;
  semesterName: string;
  average: number | null;
  validated: boolean;
  decision: SpecialJuryDecision | null;
};

export type SpecialJuryEligibleStudent = {
  studentId: number;
  studentName: string;
  email: string;
  semesters: JurySemesterResult[];
  annualAverage: number | null;
  failedSemesters: string[];
};

export type SpecialJuryDecision = {
  id: number;
  sessionId: number;
  studentId: number;
  semesterId: number;
  decision: "validated" | "failed" | "conditional";
  previousAverage: number | null;
  newAverage: number | null;
  justification: string;
  source: string;
  decidedAt: string;
  notified: boolean;
};

export type RecordJuryDecisionRequest = {
  studentId: number;
  semesterId: number;
  decision: "validated" | "failed" | "conditional";
  newAverage?: number;
  justification: string;
};

export const useListJurySessions = (options?: QueryOpts<SpecialJurySession[]>) =>
  useQuery<SpecialJurySession[], Error>({
    queryKey: ["/api/admin/jury-special/sessions"],
    queryFn: () => customFetch<SpecialJurySession[]>("/api/admin/jury-special/sessions"),
    ...options,
  });

export const useActivateJurySession = () =>
  useMutation<SpecialJurySession, Error, { academicYear: string; notes?: string }>({
    mutationFn: (body) =>
      customFetch<SpecialJurySession>("/api/admin/jury-special/sessions", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  });

export const useGetJuryEligibleStudents = (sessionId: number | null, options?: QueryOpts<SpecialJuryEligibleStudent[]>) =>
  useQuery<SpecialJuryEligibleStudent[], Error>({
    queryKey: ["/api/admin/jury-special/sessions", sessionId, "eligible"],
    queryFn: () => customFetch<SpecialJuryEligibleStudent[]>(`/api/admin/jury-special/sessions/${sessionId}/eligible`),
    enabled: !!sessionId,
    ...options,
  });

export const useRecordJuryDecision = (sessionId: number | null) =>
  useMutation<SpecialJuryDecision, Error, RecordJuryDecisionRequest>({
    mutationFn: (body) =>
      customFetch<SpecialJuryDecision>(`/api/admin/jury-special/sessions/${sessionId}/decisions`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
  });

export const useCloseJurySession = () =>
  useMutation<SpecialJurySession & { notifiedCount: number }, Error, number>({
    mutationFn: (sessionId) =>
      customFetch<SpecialJurySession & { notifiedCount: number }>(`/api/admin/jury-special/sessions/${sessionId}/close`, {
        method: "POST",
      }),
  });

export const useGetJuryPVData = (sessionId: number | null, options?: QueryOpts<any>) =>
  useQuery<any, Error>({
    queryKey: ["/api/admin/jury-special/sessions", sessionId, "pv"],
    queryFn: () => customFetch<any>(`/api/admin/jury-special/sessions/${sessionId}/pv`),
    enabled: false,
    ...options,
  });

// ─── Évaluations des enseignants ─────────────────────────────────────────────

export type EvaluationPeriodSummary = {
  id: number;
  semesterId: number;
  semesterName: string | null;
  deadline: string;
  isActive: boolean;
  resultsVisible: boolean;
  createdAt: string;
  evaluationCount: number;
  submitterCount: number;
};

export type EvaluationTeacher = {
  teacherId: number;
  teacherName: string | null;
  subjectId: number;
  subjectName: string | null;
  submitted: boolean;
};

export type StudentEvaluationsCurrentResponse = {
  period: (EvaluationPeriodSummary & { expired?: boolean }) | null;
  teachers: EvaluationTeacher[];
  classId?: number;
};

export type SubmitEvaluationRequest = {
  periodId: number;
  teacherId: number;
  subjectId: number;
  classId: number;
  // Section A — Contenu de la Formation
  a1: number; a2: number; a3: number; a4: number; a5: number;
  // Section B — Formateur
  b1: number; b2: number; b3: number; b4: number; b5: number;
  b6: number; b7: number; b8: number; b9: number;
  // Section C — Apprenants
  c1: number; c2: number; c3: number; c4: number; c5: number; c6: number;
  // Section D — Appréciations libres
  d1?: string; d2?: string; d3?: string; d4?: string;
  // Question finale
  utilite?: number;
};

export type EvaluationSectionDComments = {
  d1: string[];
  d2: string[];
  d3: string[];
  d4: string[];
  utilite: Record<string, number>;
};

export type EvaluationResultRow = {
  teacherId: number;
  teacherName: string | null;
  subjectId: number;
  subjectName: string | null;
  classId: number;
  className: string | null;
  evaluationCount: number;
  avgA: number | null;
  avgB: number | null;
  avgC: number | null;
  globalAvg: number | null;
  mention: string | null;
  criteriaA: number[];
  criteriaB: number[];
  criteriaC: number[];
  sectionDComments: EvaluationSectionDComments;
};

export type AdminEvaluationResultsResponse = {
  period: EvaluationPeriodSummary;
  results: EvaluationResultRow[];
  hiddenCount: number;
};

export type TeacherEvaluationResultRow = {
  subjectId: number;
  subjectName: string | null;
  classId: number;
  className: string | null;
  evaluationCount: number;
  avgA: number | null;
  avgB: number | null;
  avgC: number | null;
  globalAvg: number | null;
  mention: string | null;
  criteriaA: number[];
  criteriaB: number[];
  criteriaC: number[];
};

export type TeacherEvaluationResultGroup = {
  periodId: number;
  semesterId: number;
  deadline: string;
  rows: TeacherEvaluationResultRow[];
  sectionDComments: Omit<EvaluationSectionDComments, "utilite">;
  utiliteDistribution: Record<string, number>;
  belowThreshold: boolean;
};

export const useListEvaluationPeriods = (options?: QueryOpts<EvaluationPeriodSummary[]>) =>
  useQuery<EvaluationPeriodSummary[], Error>({
    queryKey: ["/api/admin/evaluations/periods"],
    queryFn: () => customFetch<EvaluationPeriodSummary[]>("/api/admin/evaluations/periods"),
    ...options,
  });

export const useCreateEvaluationPeriod = () =>
  useMutation<any, Error, { semesterId: number; deadline: string; isActive?: boolean }>({
    mutationFn: (body) =>
      customFetch<any>("/api/admin/evaluations/periods", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  });

export const useUpdateEvaluationPeriod = () =>
  useMutation<any, Error, { id: number; deadline?: string; isActive?: boolean; resultsVisible?: boolean }>({
    mutationFn: ({ id, ...body }) =>
      customFetch<any>(`/api/admin/evaluations/periods/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
  });

export const useGetEvaluationResults = (periodId: number | null, options?: QueryOpts<AdminEvaluationResultsResponse>) =>
  useQuery<AdminEvaluationResultsResponse, Error>({
    queryKey: ["/api/admin/evaluations/periods", periodId, "results"],
    queryFn: () => customFetch<AdminEvaluationResultsResponse>(`/api/admin/evaluations/periods/${periodId}/results`),
    enabled: !!periodId,
    ...options,
  });

export const useSendEvaluationReminder = () =>
  useMutation<{ sent: number }, Error, number>({
    mutationFn: (periodId) =>
      customFetch<{ sent: number }>(`/api/admin/evaluations/periods/${periodId}/notify-reminder`, {
        method: "POST",
      }),
  });

export const useStudentEvaluationsCurrent = (options?: QueryOpts<StudentEvaluationsCurrentResponse>) =>
  useQuery<StudentEvaluationsCurrentResponse, Error>({
    queryKey: ["/api/student/evaluations/current"],
    queryFn: () => customFetch<StudentEvaluationsCurrentResponse>("/api/student/evaluations/current"),
    ...options,
  });

export const useSubmitEvaluation = () =>
  useMutation<{ message: string }, Error, SubmitEvaluationRequest>({
    mutationFn: (body) =>
      customFetch<{ message: string }>("/api/student/evaluations/submit", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  });

export const useTeacherEvaluationResults = (options?: QueryOpts<{ results: TeacherEvaluationResultGroup[] }>) =>
  useQuery<{ results: TeacherEvaluationResultGroup[] }, Error>({
    queryKey: ["/api/teacher/evaluations/results"],
    queryFn: () => customFetch<{ results: TeacherEvaluationResultGroup[] }>("/api/teacher/evaluations/results"),
    ...options,
  });
