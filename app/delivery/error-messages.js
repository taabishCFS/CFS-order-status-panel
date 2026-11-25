// The sentence staff see for each refusal code from the delivery routes. The server sends it with the error, so the extension
// (which has a 64 KB size limit) does not carry the text.
export const MESSAGES = {
  staff_not_verified: "Only a verified staff member can do this.",
  no_permission: "You do not have permission for this. Ask a manager to tick it on the Permissions page.",
  no_lines: "Some of those items were not found or can no longer be booked. Refresh the list and try again.",
  not_booked: "None of the ticked items has a booking to reschedule.",
  not_found: "That item was not found. Refresh and try again.",
  duplicate_name: "That name is already in the list.",
  duplicate: "Another order already has that van and drop on that day.",
  unknown_van: "That van is not available. Refresh and choose again.",
  unknown_driver: "That driver is not available. Refresh and choose again.",
  unknown_slot: "That slot is not available. Refresh and choose again.",
  bad_date: "Choose a valid delivery date.",
  bad_drop: "The drop must be a number from 1 to 16.",
  drop_limit: "A van can have at most 16 drops. Choose a lower drop number.",
  bad_am_pm: "Choose All Day, AM or PM.",
  bad_partner: "Choose a delivery partner from the list.",
  drop_needs_van: "Choose a van before choosing a drop.",
  van_required: "Select Driver/van.",
  drop_required: "Select Drop Number.",
  slot_required: "Select Time Slot.",
  reason_required: "Give a reason for rescheduling.",
  bad_request: "The request was not accepted. Refresh the page and try again.",
};

/** The body with a `message` added when it carries a known error code. */
export const withMessage = (body) => (body && body.error && MESSAGES[body.error] && !body.message ? { ...body, message: MESSAGES[body.error] } : body);
