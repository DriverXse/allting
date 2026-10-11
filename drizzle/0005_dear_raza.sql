-- Add a private preference in place, preserving users, references and triggers.
ALTER TABLE users ADD COLUMN theme_preference text NOT NULL DEFAULT 'system'
  CONSTRAINT theme_options CHECK (theme_preference IN ('light','dark','system'));
