export interface User {
  user_id: string;
  name: string;
  role: string;
  manager_id: string | null;
}

export interface Question {
  question_id: string;
  question_text: string;
  level: string;
  day: string;
  topic: string;
  type: 'Number' | 'Drop-Down' | 'Text' | 'Multi-Select';
  option_1?: string;
  option_2?: string;
  option_3?: string;
  option_4?: string;
  option_5?: string;
}

export interface Submission {
  id?: number;
  date: string;
  user_id: string;
  target_user: string;
  status: string;
}

export interface Response {
  id?: number;
  date: string;
  filled_by: string;
  target_user: string;
  question_id: string;
  question: string;
  answer: string;
}
