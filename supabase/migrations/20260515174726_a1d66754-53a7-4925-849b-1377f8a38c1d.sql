
-- Fix classes SELECT policy (self-reference bug prevented students from seeing joined classes)
DROP POLICY IF EXISTS "Teachers see own classes" ON public.classes;
CREATE POLICY "Class visibility for members and teachers"
ON public.classes FOR SELECT TO authenticated
USING (
  teacher_id = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.class_members cm
    WHERE cm.class_id = classes.id AND cm.student_id = auth.uid()
  )
);

-- Allow teachers to override/edit grading on submissions for their assignments
CREATE POLICY "Teachers update submissions for own assignments"
ON public.submissions FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.assignments a
    WHERE a.id = submissions.assignment_id AND a.teacher_id = auth.uid()
  )
);

-- Allow teachers to override answer scores/feedback for their assignments
CREATE POLICY "Teachers update answers for own assignments"
ON public.answers FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.submissions s
    JOIN public.assignments a ON a.id = s.assignment_id
    WHERE s.id = answers.submission_id AND a.teacher_id = auth.uid()
  )
);
