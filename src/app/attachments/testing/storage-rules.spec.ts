import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { deleteObject, getBlob, listAll, ref, uploadBytes } from 'firebase/storage';

// Executed by tools/request-attachment-emulator-tests.cjs; typed here for contract discoverability.
xdescribe('request attachment Storage rules contract', () => {
  it('allows signed-in get, denies anonymous get and all list operations', async () => {
    const contexts = (globalThis as any).attachmentRuleContexts;
    const path = 'request-attachments/attendance/r/s/a';
    await assertSucceeds(getBlob(ref(contexts.owner.storage(), path)));
    await assertFails(getBlob(ref(contexts.anonymous.storage(), path)));
    await assertFails(listAll(ref(contexts.owner.storage(), 'request-attachments')));
  });

  it('denies overwrite and invalid MIME or oversized creates', async () => {
    const contexts = (globalThis as any).attachmentRuleContexts;
    const target = ref(contexts.owner.storage(), 'request-attachments/attendance/r/s/a');
    await assertFails(uploadBytes(target, new Blob(['x'], { type: 'text/plain' })));
    await assertFails(uploadBytes(target, new Blob([new Uint8Array(3 * 1024 * 1024 + 1)], { type: 'application/pdf' })));
  });

  it('permits queue-governed idempotent delete', async () => {
    const contexts = (globalThis as any).attachmentRuleContexts;
    await assertSucceeds(deleteObject(ref(contexts.owner.storage(), 'request-attachments/attendance/r/s/a')));
  });
});
