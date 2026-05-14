
-- Roles enum + user_roles table (separate from profiles for security)
CREATE TYPE public.app_role AS ENUM ('admin', 'teacher', 'student');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Security definer to avoid RLS recursion
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Auto profile + default student role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'student'));

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Classes
CREATE TABLE public.classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.class_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(class_id, student_id)
);

-- Assignments
CREATE TABLE public.assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TYPE public.question_type AS ENUM ('mcq', 'text');

CREATE TABLE public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  type question_type NOT NULL,
  prompt TEXT NOT NULL,
  options JSONB,            -- array of strings for MCQ
  correct_answer TEXT,      -- index for MCQ, e.g., "0"
  model_answer TEXT,        -- reference answer for text
  rubric TEXT,              -- optional grading rubric for text
  points INT NOT NULL DEFAULT 1,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Submissions
CREATE TYPE public.submission_status AS ENUM ('in_progress', 'submitted', 'graded');

CREATE TABLE public.submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status submission_status NOT NULL DEFAULT 'in_progress',
  total_score NUMERIC,
  max_score NUMERIC,
  overall_feedback TEXT,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(assignment_id, student_id)
);

CREATE TABLE public.answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  response TEXT,
  score NUMERIC,
  feedback TEXT,
  is_correct BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(submission_id, question_id)
);

-- Indexes
CREATE INDEX ON public.class_members(student_id);
CREATE INDEX ON public.class_members(class_id);
CREATE INDEX ON public.assignments(class_id);
CREATE INDEX ON public.questions(assignment_id);
CREATE INDEX ON public.submissions(assignment_id);
CREATE INDEX ON public.submissions(student_id);
CREATE INDEX ON public.answers(submission_id);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.answers ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Profiles viewable by authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);

-- user_roles policies
CREATE POLICY "Users see own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Classes policies
CREATE POLICY "Teachers see own classes" ON public.classes
  FOR SELECT TO authenticated
  USING (
    teacher_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.class_members cm WHERE cm.class_id = id AND cm.student_id = auth.uid())
  );
CREATE POLICY "Teachers create classes" ON public.classes
  FOR INSERT TO authenticated
  WITH CHECK (teacher_id = auth.uid() AND public.has_role(auth.uid(), 'teacher'));
CREATE POLICY "Teachers update own classes" ON public.classes
  FOR UPDATE TO authenticated USING (teacher_id = auth.uid());
CREATE POLICY "Teachers delete own classes" ON public.classes
  FOR DELETE TO authenticated USING (teacher_id = auth.uid());

-- class_members policies
CREATE POLICY "Members visible to teacher and student" ON public.class_members
  FOR SELECT TO authenticated
  USING (
    student_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.classes c WHERE c.id = class_id AND c.teacher_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );
CREATE POLICY "Students join classes" ON public.class_members
  FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid());
CREATE POLICY "Students leave or teacher removes" ON public.class_members
  FOR DELETE TO authenticated
  USING (
    student_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.classes c WHERE c.id = class_id AND c.teacher_id = auth.uid())
  );

-- Assignments policies
CREATE POLICY "Assignments visible to class members and teacher" ON public.assignments
  FOR SELECT TO authenticated
  USING (
    teacher_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.class_members cm WHERE cm.class_id = assignments.class_id AND cm.student_id = auth.uid())
  );
CREATE POLICY "Teachers create assignments" ON public.assignments
  FOR INSERT TO authenticated
  WITH CHECK (teacher_id = auth.uid() AND EXISTS (SELECT 1 FROM public.classes c WHERE c.id = class_id AND c.teacher_id = auth.uid()));
CREATE POLICY "Teachers update own assignments" ON public.assignments
  FOR UPDATE TO authenticated USING (teacher_id = auth.uid());
CREATE POLICY "Teachers delete own assignments" ON public.assignments
  FOR DELETE TO authenticated USING (teacher_id = auth.uid());

-- Questions: teachers full access, students NO direct access (use server fn to sanitize)
CREATE POLICY "Teachers manage questions" ON public.questions
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.assignments a WHERE a.id = assignment_id AND (a.teacher_id = auth.uid() OR public.has_role(auth.uid(), 'admin')))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.assignments a WHERE a.id = assignment_id AND a.teacher_id = auth.uid())
  );

-- Submissions
CREATE POLICY "Students see own submissions; teachers see for their assignments" ON public.submissions
  FOR SELECT TO authenticated
  USING (
    student_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.assignments a WHERE a.id = assignment_id AND a.teacher_id = auth.uid())
  );
CREATE POLICY "Students insert own submission" ON public.submissions
  FOR INSERT TO authenticated WITH CHECK (student_id = auth.uid());
CREATE POLICY "Students update own submission" ON public.submissions
  FOR UPDATE TO authenticated USING (student_id = auth.uid());

-- Answers
CREATE POLICY "Answer access mirrors submission" ON public.answers
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.submissions s
      WHERE s.id = submission_id
        AND (s.student_id = auth.uid()
          OR public.has_role(auth.uid(), 'admin')
          OR EXISTS (SELECT 1 FROM public.assignments a WHERE a.id = s.assignment_id AND a.teacher_id = auth.uid()))
    )
  );
CREATE POLICY "Students upsert own answers" ON public.answers
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.submissions s WHERE s.id = submission_id AND s.student_id = auth.uid())
  );
CREATE POLICY "Students update own answers" ON public.answers
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.submissions s WHERE s.id = submission_id AND s.student_id = auth.uid())
  );
