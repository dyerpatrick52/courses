export interface Term {
  id: number;
  term_code: string;
  term_name: string;
}

export interface Course {
  subject_code: string;
  course_code: string;
  course_name: string;
}

export interface ScheduleMeeting {
  day: string;
  start: string;
  end: string;
  component: string;
  section_code: string;
  date_start: string;
  date_end: string;
}

export interface ScheduleCourse {
  instructor: string;
  meetings: ScheduleMeeting[];
}

export type FormattedSchedule = Record<string, ScheduleCourse>;

export interface GenerateRequest {
  term_code: string;
  courses: string[];
  filters?: {
    allowed_sections?: Record<string, string[]>;
    free_days?: string[];
    no_back_to_back?: boolean;
    no_three_in_row?: boolean;
    earliest_start?: string;
    latest_end?: string;
  };
}

export interface GenerateResponse {
  count: number;
  schedules: FormattedSchedule[];
}
