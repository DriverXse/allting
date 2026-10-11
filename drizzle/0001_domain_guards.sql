-- Custom SQL migration file, put your code below! --
CREATE TRIGGER IF NOT EXISTS offer_creation_guard BEFORE INSERT ON trade_offers BEGIN
 SELECT RAISE(ABORT,'offer_creation') WHERE NEW.status!='draft' OR NEW.proposer_id NOT IN (NEW.initiator_id,NEW.recipient_id);
 SELECT RAISE(ABORT,'participants_inactive') WHERE (SELECT count(*) FROM users WHERE id IN (NEW.initiator_id,NEW.recipient_id) AND suspended=0 AND email_verified=1)!=2;
 SELECT RAISE(ABORT,'blocked') WHERE EXISTS(SELECT 1 FROM blocks WHERE (blocker_id=NEW.initiator_id AND blocked_id=NEW.recipient_id) OR (blocker_id=NEW.recipient_id AND blocked_id=NEW.initiator_id));
 SELECT RAISE(ABORT,'offer_root') WHERE NEW.parent_offer_id IS NULL AND (NEW.root_offer_id!=NEW.id OR NEW.proposer_id!=NEW.initiator_id);
 SELECT RAISE(ABORT,'offer_parent') WHERE NEW.parent_offer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM trade_offers p WHERE p.id=NEW.parent_offer_id AND p.status='pending' AND p.proposer_id!=NEW.proposer_id AND p.initiator_id=NEW.initiator_id AND p.recipient_id=NEW.recipient_id AND p.root_offer_id=NEW.root_offer_id);
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS offer_item_guard BEFORE INSERT ON trade_offer_items BEGIN
 SELECT RAISE(ABORT,'offer_item_owner_or_inactive') WHERE NOT EXISTS(SELECT 1 FROM trade_offers o JOIN listings l ON l.id=NEW.listing_id JOIN users u ON u.id=l.owner_id WHERE o.id=NEW.trade_offer_id AND o.status='draft' AND l.status='active' AND l.moderated_hidden=0 AND u.suspended=0 AND ((NEW.side='initiator' AND l.owner_id=o.initiator_id) OR (NEW.side='recipient' AND l.owner_id=o.recipient_id)));
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS offer_item_delete_guard BEFORE DELETE ON trade_offer_items WHEN (SELECT status FROM trade_offers WHERE id=OLD.trade_offer_id)!='draft' BEGIN SELECT RAISE(ABORT,'offer_items_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS offer_item_update_guard BEFORE UPDATE ON trade_offer_items BEGIN SELECT RAISE(ABORT,'offer_items_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS offer_status_guard BEFORE UPDATE OF status ON trade_offers WHEN OLD.status!=NEW.status BEGIN
 SELECT RAISE(ABORT,'offer_transition') WHERE NOT ((OLD.status='draft' AND NEW.status='pending') OR (OLD.status='pending' AND NEW.status IN ('accepted','declined','cancelled','countered')) OR (OLD.status='accepted' AND NEW.status IN ('cancelled','completed')));
 SELECT RAISE(ABORT,'offer_items_missing') WHERE NEW.status='pending' AND ((SELECT count(*) FROM trade_offer_items WHERE trade_offer_id=NEW.id AND side='initiator') NOT BETWEEN 1 AND 12 OR (SELECT count(*) FROM trade_offer_items WHERE trade_offer_id=NEW.id AND side='recipient') NOT BETWEEN 1 AND 12 OR NOT EXISTS(SELECT 1 FROM trade_offer_items WHERE trade_offer_id=NEW.id AND listing_id=NEW.target_listing_id AND side='recipient'));
 SELECT RAISE(ABORT,'offer_parent_not_replaced') WHERE NEW.status='pending' AND NEW.parent_offer_id IS NOT NULL AND (SELECT status FROM trade_offers WHERE id=NEW.parent_offer_id)!='countered';
 SELECT RAISE(ABORT,'offer_counter_missing') WHERE NEW.status='countered' AND NOT EXISTS(SELECT 1 FROM trade_offers WHERE parent_offer_id=NEW.id AND status='draft');
 SELECT RAISE(ABORT,'offer_items_unavailable') WHERE NEW.status='accepted' AND EXISTS(SELECT 1 FROM trade_offer_items i JOIN listings l ON l.id=i.listing_id JOIN users u ON u.id=l.owner_id WHERE i.trade_offer_id=NEW.id AND (l.status!='active' OR l.moderated_hidden=1 OR u.suspended=1));
 SELECT RAISE(ABORT,'blocked') WHERE NEW.status='accepted' AND EXISTS(SELECT 1 FROM blocks WHERE (blocker_id=NEW.initiator_id AND blocked_id=NEW.recipient_id) OR (blocker_id=NEW.recipient_id AND blocked_id=NEW.initiator_id));
 SELECT RAISE(ABORT,'offer_confirmation_missing') WHERE NEW.status='completed' AND (NEW.initiator_confirmed!=1 OR NEW.recipient_confirmed!=1);
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS accepted_reserves AFTER UPDATE OF status ON trade_offers WHEN NEW.status='accepted' AND OLD.status='pending' BEGIN
 UPDATE listings SET status='reserved',reserved_offer_id=NEW.id WHERE id IN (SELECT listing_id FROM trade_offer_items WHERE trade_offer_id=NEW.id);
 UPDATE trade_offers SET status='cancelled' WHERE status='pending' AND id!=NEW.id AND id IN (SELECT i.trade_offer_id FROM trade_offer_items i WHERE i.listing_id IN (SELECT listing_id FROM trade_offer_items WHERE trade_offer_id=NEW.id));
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS cancel_releases AFTER UPDATE OF status ON trade_offers WHEN NEW.status='cancelled' AND OLD.status='accepted' BEGIN UPDATE listings SET status='active',reserved_offer_id=NULL WHERE reserved_offer_id=NEW.id AND status='reserved'; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS complete_when_confirmed AFTER UPDATE OF initiator_confirmed,recipient_confirmed ON trade_offers WHEN NEW.status='accepted' AND NEW.initiator_confirmed=1 AND NEW.recipient_confirmed=1 BEGIN UPDATE trade_offers SET status='completed' WHERE id=NEW.id; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS completion_trades AFTER UPDATE OF status ON trade_offers WHEN NEW.status='completed' AND OLD.status='accepted' BEGIN
 UPDATE listings SET status='traded',reserved_offer_id=NULL WHERE reserved_offer_id=NEW.id;
 INSERT INTO notifications(id,user_id,type,body,href) VALUES (lower(hex(randomblob(16))),NEW.initiator_id,'completed','Ni har båda bekräftat bytet. Nu kan du lämna ett betyg.','/byten/'||NEW.root_offer_id),(lower(hex(randomblob(16))),NEW.recipient_id,'completed','Ni har båda bekräftat bytet. Nu kan du lämna ett betyg.','/byten/'||NEW.root_offer_id);
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS offer_system_history AFTER UPDATE OF status ON trade_offers WHEN NEW.status IN ('accepted','declined','cancelled','completed') AND OLD.status!=NEW.status BEGIN
 INSERT INTO messages(id,conversation_id,type,body) SELECT lower(hex(randomblob(16))),id,'system','Ni har kommit överens om ett byte. Sakerna är reserverade.' FROM conversations WHERE id=NEW.root_offer_id AND NEW.status='accepted';
 INSERT INTO messages(id,conversation_id,type,body) SELECT lower(hex(randomblob(16))),id,'system','Förslaget avböjdes.' FROM conversations WHERE id=NEW.root_offer_id AND NEW.status='declined';
 INSERT INTO messages(id,conversation_id,type,body) SELECT lower(hex(randomblob(16))),id,'system','Båda har bekräftat att bytet är genomfört.' FROM conversations WHERE id=NEW.root_offer_id AND NEW.status='completed';
 INSERT INTO messages(id,conversation_id,type,body) SELECT lower(hex(randomblob(16))),id,'system','Bytet avbröts. Ingen överenskommelse gäller längre.' FROM conversations WHERE id=NEW.root_offer_id AND NEW.status='cancelled';
 INSERT INTO notifications(id,user_id,type,body,href) SELECT lower(hex(randomblob(16))),NEW.initiator_id,'cancelled','Ett bytesförslag avbröts eftersom förutsättningarna ändrades.','/byten/'||NEW.root_offer_id WHERE NEW.status='cancelled';
 INSERT INTO notifications(id,user_id,type,body,href) SELECT lower(hex(randomblob(16))),NEW.recipient_id,'cancelled','Ett bytesförslag avbröts eftersom förutsättningarna ändrades.','/byten/'||NEW.root_offer_id WHERE NEW.status='cancelled';
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS immutable_agreement BEFORE UPDATE ON listings WHEN OLD.status IN ('reserved','traded') AND (OLD.title!=NEW.title OR OLD.description!=NEW.description OR OLD.owner_id!=NEW.owner_id OR OLD.category_id!=NEW.category_id OR OLD.condition!=NEW.condition OR OLD.city!=NEW.city) BEGIN SELECT RAISE(ABORT,'listing_locked'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS listing_unavailable AFTER UPDATE OF status,moderated_hidden ON listings WHEN NEW.status IN ('paused','deleted','traded') OR NEW.moderated_hidden=1 BEGIN UPDATE trade_offers SET status='cancelled' WHERE status IN ('pending','accepted') AND id IN (SELECT trade_offer_id FROM trade_offer_items WHERE listing_id=NEW.id); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS blocking_cancels AFTER INSERT ON blocks BEGIN UPDATE trade_offers SET status='cancelled' WHERE status IN ('pending','accepted') AND ((initiator_id=NEW.blocker_id AND recipient_id=NEW.blocked_id) OR (initiator_id=NEW.blocked_id AND recipient_id=NEW.blocker_id)); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS suspension_cancels AFTER UPDATE OF suspended ON users WHEN NEW.suspended=1 BEGIN UPDATE trade_offers SET status='cancelled' WHERE status IN ('pending','accepted') AND (initiator_id=NEW.id OR recipient_id=NEW.id); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS message_participants BEFORE INSERT ON messages WHEN NEW.type='user' BEGIN
 SELECT RAISE(ABORT,'message_participants_or_blocked') WHERE NEW.sender_id IS NULL OR NOT EXISTS(SELECT 1 FROM conversations c JOIN trade_offers o ON o.id=c.current_offer_id JOIN users u ON u.id=NEW.sender_id WHERE c.id=NEW.conversation_id AND NEW.sender_id IN (o.initiator_id,o.recipient_id) AND u.suspended=0 AND NOT EXISTS(SELECT 1 FROM users WHERE id IN (o.initiator_id,o.recipient_id) AND suspended=1) AND NOT EXISTS(SELECT 1 FROM blocks WHERE (blocker_id=o.initiator_id AND blocked_id=o.recipient_id) OR (blocker_id=o.recipient_id AND blocked_id=o.initiator_id)));
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS review_completion_guard BEFORE INSERT ON reviews BEGIN SELECT RAISE(ABORT,'review_completed_trade_only') WHERE NOT EXISTS(SELECT 1 FROM trade_offers WHERE id=NEW.trade_offer_id AND status='completed' AND NEW.reviewer_id IN (initiator_id,recipient_id) AND NEW.reviewed_user_id IN (initiator_id,recipient_id) AND NEW.reviewer_id!=NEW.reviewed_user_id); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS image_count_guard BEFORE INSERT ON listing_images WHEN (SELECT count(*) FROM listing_images WHERE listing_id=NEW.listing_id)>=6 BEGIN SELECT RAISE(ABORT,'listing_images_maximum'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS image_insert_locked BEFORE INSERT ON listing_images WHEN (SELECT status FROM listings WHERE id=NEW.listing_id) IN ('reserved','traded') BEGIN SELECT RAISE(ABORT,'listing_locked'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS image_delete_locked BEFORE DELETE ON listing_images WHEN (SELECT status FROM listings WHERE id=OLD.listing_id) IN ('reserved','traded') BEGIN SELECT RAISE(ABORT,'listing_locked'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS image_update_locked BEFORE UPDATE ON listing_images WHEN (SELECT status FROM listings WHERE id=OLD.listing_id) IN ('reserved','traded') BEGIN SELECT RAISE(ABORT,'listing_locked'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS wanted_insert_locked BEFORE INSERT ON wanted_terms WHEN (SELECT status FROM listings WHERE id=NEW.listing_id) IN ('reserved','traded') BEGIN SELECT RAISE(ABORT,'listing_locked'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS wanted_delete_locked BEFORE DELETE ON wanted_terms WHEN (SELECT status FROM listings WHERE id=OLD.listing_id) IN ('reserved','traded') BEGIN SELECT RAISE(ABORT,'listing_locked'); END;
