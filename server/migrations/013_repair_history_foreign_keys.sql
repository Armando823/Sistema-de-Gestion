ALTER TABLE repair_status_history
  ADD CONSTRAINT repair_status_history_repair_fk FOREIGN KEY (repair_id)
    REFERENCES repairs(id) ON DELETE CASCADE,
  ADD CONSTRAINT repair_status_history_actor_fk FOREIGN KEY (actor_email)
    REFERENCES accounts(email);
