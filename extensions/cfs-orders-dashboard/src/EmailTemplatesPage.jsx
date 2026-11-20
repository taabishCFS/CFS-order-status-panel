import { useEffect, useState } from 'preact/hooks';
import { callBackend, callBackendResult } from './backend';
import { canSaveTemplate, describeVersion, htmlToLines, templateError, unknownPlaceholders } from './emailTemplates';

const post = (path, body) =>
  callBackendResult(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const when = (iso) => new Date(iso).toLocaleString('en-GB');
const tag = (name) => `{{${name}}}`;

// Staff-editable customer email templates: edit, preview, send a test, save a new version, restore an old one.
export default function EmailTemplatesPage() {
  const [list, setList] = useState(null); // { templates, placeholders }
  const [loadError, setLoadError] = useState(null);
  const [verified, setVerified] = useState(null); // staff verified by the backend, or null
  const [key, setKey] = useState(null);
  const [detail, setDetail] = useState(null); // { template, versions, placeholders }
  const [form, setForm] = useState({ subject: '', body: '', reason: '' });
  const [preview, setPreview] = useState(null); // { subject, lines }
  const [banner, setBanner] = useState(null); // { tone, text }
  const [busy, setBusy] = useState(false);

  async function loadList() {
    try {
      setList(await callBackend('api/email-templates'));
      setLoadError(null);
    } catch (e) {
      setLoadError(e.message);
    }
  }

  useEffect(() => {
    loadList();
    callBackend('api/whoami').then((r) => setVerified(r?.staff?.name ? r.staff : null)).catch(() => setVerified(null));
  }, []);

  async function open(templateKey) {
    setKey(templateKey);
    setDetail(null);
    setPreview(null);
    setBanner(null);
    const res = await callBackendResult(`api/email-templates/${templateKey}`).catch(() => null);
    if (!res?.ok) {
      setBanner({ tone: 'critical', text: 'That template could not be loaded.' });
      return;
    }
    setDetail(res.body);
    setForm({ subject: res.body.template.subject, body: res.body.template.body, reason: '' });
  }

  // Runs one backend action; on success `onOk` gets the answer, otherwise the banner explains why.
  async function run(intent, extra, onOk) {
    setBusy(true);
    setBanner(null);
    try {
      const res = await post(`api/email-templates/${key}`, { intent, ...extra });
      if (res.ok) await onOk(res.body);
      else setBanner({ tone: 'critical', text: templateError(res.status, res.body) });
    } catch {
      setBanner({ tone: 'critical', text: 'Could not reach the backend.' });
    }
    setBusy(false);
  }

  const current = detail?.template;
  const isLayout = key === 'layout';
  const changed = current && (form.subject !== current.subject || form.body !== current.body);
  const allowed = detail?.placeholders;
  const unknown = allowed ? [...unknownPlaceholders(form.subject, allowed), ...unknownPlaceholders(form.body, allowed).filter((n) => !unknownPlaceholders(form.subject, allowed).includes(n))] : [];
  const canSave = Boolean(verified) && canSaveTemplate({ ...form, saving: busy, changed: Boolean(changed), isLayout });
  const reloadAfter = async (message) => {
    await open(key);
    await loadList();
    setBanner({ tone: 'success', text: message });
  };

  const saveIt = () => run('save', { subject: form.subject, body: form.body, expectedVersion: current.version, reason: form.reason }, (r) => reloadAfter(`Saved as version ${r.version}.`));
  const previewIt = () => run('preview', { subject: form.subject, body: form.body }, (r) => setPreview({ subject: r.subject, lines: htmlToLines(r.html) }));
  const testIt = () => run('test', { subject: form.subject, body: form.body }, (r) => setBanner({ tone: 'success', text: `Test queued for ${r.queued} test address${r.queued === 1 ? '' : 'es'}. Check the Emails list or your inbox shortly.` }));
  const restoreIt = (version) => run('restore', { version, expectedVersion: current.version, reason: `Restored from the history screen` }, (r) => reloadAfter(`Restored as version ${r.version}.`));

  return (
    <s-page heading="Email templates">
      <s-link href="/">← Orders</s-link>

      {loadError && <s-banner tone="critical" heading="Could not load the templates">{loadError}</s-banner>}
      {!list && !loadError && <s-spinner accessibilityLabel="Loading templates" />}
      {!verified && list && <s-banner tone="warning">Shopify did not say who is signed in, so templates can be viewed but not changed.</s-banner>}

      {list && (
        <s-section heading="Templates">
          <s-stack direction="block" gap="small-300">
            {list.templates.map((t) => (
              <s-stack key={t.key} direction="inline" gap="small" alignItems="center">
                <s-button variant={t.key === key ? 'primary' : undefined} onClick={() => open(t.key)}>{t.name}</s-button>
                <s-text>
                  Version {t.version}{t.updatedByName ? ` · edited by ${t.updatedByName} ${when(t.updatedAt)}` : ' · original legacy wording'}
                </s-text>
              </s-stack>
            ))}
          </s-stack>
        </s-section>
      )}

      {key && banner && <s-banner tone={banner.tone}>{banner.text}</s-banner>}

      {key && detail && (
        <s-section heading={`Edit: ${list?.templates.find((t) => t.key === key)?.name ?? key} (version ${current.version})`}>
          <s-stack direction="block" gap="base">
            {isLayout
              ? <s-text>This is the header and footer around every email. Put {tag('content')} where each email&apos;s own text should go.</s-text>
              : <s-text-field label="Subject" value={form.subject} onInput={(e) => setForm({ ...form, subject: e.currentTarget.value })} />}
            <s-text-area label={isLayout ? 'Layout (HTML)' : 'Body (HTML)'} rows={18} value={form.body} onInput={(e) => setForm({ ...form, body: e.currentTarget.value })} />
            {unknown.length > 0 && <s-banner tone="warning">Not a known placeholder: {unknown.map(tag).join(', ')}. It will be refused when you save.</s-banner>}

            <s-box padding="small" border="base" borderRadius="base">
              <s-stack direction="block" gap="small-300">
                <s-text type="strong">Placeholders you can use</s-text>
                <s-text>Anywhere: {allowed.order.map(tag).join(' ')}</s-text>
                {!isLayout && <s-text>Between {tag('#lines')} and {tag('/lines')} (once per item): {allowed.line.map(tag).join(' ')}</s-text>}
                {isLayout && <s-text>Layout only: {allowed.layout.map(tag).join(' ')}</s-text>}
              </s-stack>
            </s-box>

            <s-text-field label="Reason for the change (kept in the history)" value={form.reason} onInput={(e) => setForm({ ...form, reason: e.currentTarget.value })} />
            <s-stack direction="inline" gap="small">
              <s-button onClick={previewIt} disabled={busy || undefined}>Preview</s-button>
              <s-button onClick={testIt} disabled={!verified || busy || undefined}>Send test</s-button>
              <s-button variant="primary" onClick={saveIt} disabled={!canSave || undefined} loading={busy || undefined}>Save</s-button>
            </s-stack>
            <s-text>Send test goes only to the test addresses set on the backend, never to a customer. Preview and test use sample order data.</s-text>
          </s-stack>
        </s-section>
      )}

      {key && preview && (
        <s-section heading="Preview (sample order, words only)">
          <s-stack direction="block" gap="small-300">
            <s-text type="strong">Subject: {preview.subject}</s-text>
            {preview.lines.map((line, i) => <s-text key={i}>{line}</s-text>)}
            <s-text>The real email also has the layout, colours and logo.</s-text>
          </s-stack>
        </s-section>
      )}

      {key && detail && (
        <s-section heading={`Version history (${detail.versions.length})`}>
          <s-stack direction="block" gap="small-300">
            {detail.versions.map((v) => (
              <s-stack key={v.version} direction="inline" gap="small" alignItems="center">
                <s-text>{describeVersion(v)}</s-text>
                {v.version !== current.version && (
                  <s-button disabled={!verified || busy || undefined} onClick={() => restoreIt(v.version)}>Restore</s-button>
                )}
              </s-stack>
            ))}
          </s-stack>
        </s-section>
      )}
    </s-page>
  );
}
