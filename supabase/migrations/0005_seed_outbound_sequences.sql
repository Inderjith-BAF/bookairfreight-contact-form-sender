insert into public.outbound_sequences (name,stage,subject_template,content_template,content_link,content_creator)
select * from (values
  ('Email 1','Email 1','','','',''),
  ('Email 2','Email 2','','','',''),
  ('Follow-up 1','Follow-up 1','','','',''),
  ('Follow-up 2','Follow-up 2','','','',''),
  ('Follow-up 3','Follow-up 3','','','','')
) as seed(name,stage,subject_template,content_template,content_link,content_creator)
where not exists (select 1 from public.outbound_sequences);
