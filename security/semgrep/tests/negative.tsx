// Synthetic safer counterparts, never executed; no real products or credentials.
function parse(input: string) { return JSON.parse(input); }
const verifiedTls = { rejectUnauthorized: true };
function sql(req, db) { return db.query('SELECT * FROM demo WHERE id=$1', [req.query.id]); }
function noShell(req) { return String(req.body.command); }
function EscapedText({ html }) { return <div>{html}</div>; }
const sessionToken = crypto.randomUUID();
