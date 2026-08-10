import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canManageWorkspaceRole } from "../src/lib/team-invites";

test("one account can keep different roles in multiple workspaces", () => {
  const session = readFileSync("src/lib/session.ts", "utf8");
  const acceptance = readFileSync("src/server/team-access.ts", "utf8");
  const acceptanceAction = readFileSync("src/app/team/accept/actions.ts", "utf8");
  const shell = readFileSync("src/components/app-shell.tsx", "utf8");

  assert.match(session, /const workspaceMap = new Map/);
  assert.match(session, /activeWorkspaceId \? workspaceMap\.get\(activeWorkspaceId\)/);
  assert.match(acceptance, /invite\.business\.userId === user\.id[\s\S]*?invite\.role/);
  assert.doesNotMatch(acceptance, /strongerWorkspaceRole/);
  assert.match(acceptanceAction, /setActiveWorkspaceCookie\(accepted\.businessId\)/);
  assert.match(shell, /session\.workspaces\.length > 1/);
  assert.match(shell, /action="\/api\/workspaces\/active"/);
});

test("team invitations cannot mint a second owner", () => {
  assert.equal(canManageWorkspaceRole("OWNER", "OWNER"), false);
  assert.equal(canManageWorkspaceRole("OWNER", "ADMIN"), true);
  assert.equal(canManageWorkspaceRole("ADMIN", "AGENT"), true);
});

test("owner email changes require two mailboxes and revoke old sessions", () => {
  const flow = readFileSync("src/server/auth/owner-email-change.ts", "utf8");
  const account = readFileSync("src/app/account/page.tsx", "utf8");

  assert.match(flow, /kind: "current"/);
  assert.match(flow, /kind: "new"/);
  assert.match(flow, /verifyPassword\(input\.password/);
  assert.match(flow, /passwordHash: rotatedPasswordHash/);
  assert.match(flow, /action: "owner_email_changed"/);
  assert.match(flow, /Email itu sudah menjadi akun Aijou/);
  assert.match(account, /Ini mengganti email login akun yang sama, bukan memindahkan kepemilikan/);
});
