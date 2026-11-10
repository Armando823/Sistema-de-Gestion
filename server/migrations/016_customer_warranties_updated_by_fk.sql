ALTER TABLE customer_warranties
  ADD CONSTRAINT customer_warranties_updated_by_fk FOREIGN KEY (updated_by)
    REFERENCES accounts(email);
