ALTER TABLE inventory_movements
  ADD CONSTRAINT inventory_movements_item_fk FOREIGN KEY (item_id)
    REFERENCES inventory(id) ON DELETE SET NULL,
  ADD CONSTRAINT inventory_movements_actor_fk FOREIGN KEY (actor_email)
    REFERENCES accounts(email);
