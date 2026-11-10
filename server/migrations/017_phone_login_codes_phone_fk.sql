ALTER TABLE phone_login_codes
  ADD CONSTRAINT phone_login_codes_phone_fk FOREIGN KEY (phone)
    REFERENCES accounts(phone) ON DELETE CASCADE;
