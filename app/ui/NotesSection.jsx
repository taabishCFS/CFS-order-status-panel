import { useState } from 'react';
import { INSTRUCTIONS_MAX, NOTE_MAX, applyInstructions, applyNote } from '../../extensions/cfs-order-status/src/detailState';

// Internal notes (kept in the history) and the order/delivery instructions text. No attachments.
export default function NotesSection({ detail, writer }) {
  const { ready, saving, write } = writer;
  const [note, setNote] = useState('');
  const [instructions, setInstructions] = useState(detail.state.instructions?.text ?? '');

  const addNote = async () => {
    if (await write((state, meta) => applyNote(state, { text: note, ...meta }))) setNote('');
  };
  const saveInstructions = () => write((state, meta) => applyInstructions(state, { text: instructions, ...meta }));

  return (
    <s-section heading="Notes and instructions">
      <s-stack direction="block" gap="base">
        <s-text-area label="Internal note" rows={3} value={note} onInput={(e) => setNote(e.currentTarget.value)} />
        <s-text>{note.length} / {NOTE_MAX}</s-text>
        <s-button disabled={!ready || !note.trim() || note.length > NOTE_MAX || undefined} loading={saving || undefined} onClick={addNote}>Add note</s-button>
        <s-divider />
        <s-text-area label="Order / delivery instructions" rows={3} value={instructions} onInput={(e) => setInstructions(e.currentTarget.value)} />
        <s-text>{instructions.length} / {INSTRUCTIONS_MAX}</s-text>
        <s-button disabled={!ready || instructions.length > INSTRUCTIONS_MAX || undefined} onClick={saveInstructions}>Save instructions</s-button>
      </s-stack>
    </s-section>
  );
}
