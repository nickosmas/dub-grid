import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { Client } from "pg";

import { loginAsQaAccount, QA_CALM_HAVEN_ORIGIN, QA_SUPER_ADMIN_EMAIL } from "./helpers/auth";
import { isKnownBenignConsoleNoise } from "./helpers/runtime-noise";

// 41a2 step 4: every web surface that reissues or revokes a pending invitation
// asks once and names the consequence, and none acts unconfirmed. Fixtures are
// written straight to the local database so each case owns its invitation and
// can read back exactly what a click did to it.
//
// The assertions hold whether or not the server can deliver email. With no
// Resend key (CI, and any local run that should not send real mail) a reissue
// fails delivery and must leave the previous link working; with delivery it
// must rotate the token on the same row. Either way there is still one
// invitation and its current link is live, which is what the old
// revoke-then-recreate Reinvite broke.

const DB_URL =
  process.env.LOCAL_SUPABASE_DB_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres";
const ORG_SLUG = "calmhaven";

type InvitationRow = {
  id: string;
  token: string;
  role_to_assign: string;
  revoked_at: Date | null;
  updated_at: string;
};

async function withDatabase<T>(operation: (db: Client) => Promise<T>): Promise<T> {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  try {
    return await operation(db);
  } finally {
    await db.end();
  }
}

function fixtureEmail(kind: string, testInfo: TestInfo): string {
  return `reissue-${kind}-${testInfo.project.name}-${testInfo.workerIndex}@dubgrid.test`;
}

async function removeFixtures(emails: string[]): Promise<void> {
  await withDatabase(async (db) => {
    await db.query("DELETE FROM public.invitations WHERE email = ANY($1)", [emails]);
    await db.query("DELETE FROM public.employees WHERE email = ANY($1)", [emails]);
  });
}

/** An on-schedule employee with no invitation yet. */
async function createEmployee(email: string, lastName: string): Promise<string> {
  return withDatabase(async (db) => {
    const employee = await db.query<{ id: string }>(
      `INSERT INTO public.employees
         (org_id, employee_number, first_name, last_name, seniority, email, status,
          employment_type, focus_area_ids, role_ids, certification_id)
       SELECT e.org_id,
              (SELECT max(employee_number) + 1 FROM public.employees WHERE org_id = e.org_id),
              'Reissue', $2,
              (SELECT max(seniority) + 1 FROM public.employees WHERE org_id = e.org_id),
              $1, 'active', 'full_time', e.focus_area_ids, e.role_ids, e.certification_id
         FROM public.employees e
         JOIN public.organizations o ON o.id = e.org_id
        WHERE o.slug = $3 AND cardinality(e.focus_area_ids) > 0 AND e.status = 'active'
        ORDER BY e.employee_number
        LIMIT 1
       RETURNING id`,
      [email, lastName, ORG_SLUG],
    );
    const employeeId = employee.rows[0]?.id;
    if (!employeeId) throw new Error("Could not create the fixture employee");
    return employeeId;
  });
}

/** An on-schedule employee with a pending `user` invitation from the QA super admin. */
async function createEmployeeInvitation(email: string, lastName: string) {
  const employeeId = await createEmployee(email, lastName);
  return withDatabase(async (db) => {
    const sent = await db.query<{ result: { invitation_id: string } }>(
      `SELECT public.send_invitation(
         $1, 'user', o.id, $2, 'Reissue', $3, NULL, '{}'::bigint[], '{}'::bigint[],
         (SELECT id FROM auth.users WHERE email = $4)) AS result
         FROM public.organizations o WHERE o.slug = $5`,
      [email, employeeId, lastName, QA_SUPER_ADMIN_EMAIL, ORG_SLUG],
    );
    return { employeeId, invitationId: sent.rows[0]!.result.invitation_id };
  });
}

/** A management-only pending invitation, listed under its `inv:` id. */
async function createManagementInvitation(email: string, lastName: string) {
  return withDatabase(async (db) => {
    const sent = await db.query<{ result: { invitation_id: string } }>(
      `SELECT public.send_invitation(
         $1, 'user', o.id, NULL, 'Reissue', $2, NULL, m.department_ids, '{}'::bigint[],
         (SELECT id FROM auth.users WHERE email = $3)) AS result
         FROM public.organizations o
         JOIN public.organization_memberships m ON m.org_id = o.id
         JOIN auth.users u ON u.id = m.user_id
        WHERE o.slug = $4 AND u.email = 'qa-management@dubgrid.test'`,
      [email, lastName, QA_SUPER_ADMIN_EMAIL, ORG_SLUG],
    );
    return { invitationId: sent.rows[0]!.result.invitation_id };
  });
}

async function readInvitations(email: string): Promise<InvitationRow[]> {
  return withDatabase(async (db) => {
    const result = await db.query<InvitationRow>(
      `SELECT id, token::text, role_to_assign::text, revoked_at, updated_at::text
         FROM public.invitations WHERE email = $1 ORDER BY created_at`,
      [email],
    );
    return result.rows;
  });
}

async function readOnlyInvitation(email: string): Promise<InvitationRow> {
  const rows = await readInvitations(email);
  expect(rows, `exactly one invitation for ${email}`).toHaveLength(1);
  return rows[0]!;
}

async function auditActions(invitationId: string): Promise<string[]> {
  return withDatabase(async (db) => {
    const result = await db.query<{ action: string }>(
      `SELECT action FROM public.audit_log
        WHERE resource_type = 'invitation' AND resource_id = $1
        ORDER BY created_at`,
      [invitationId],
    );
    return result.rows.map((row) => row.action);
  });
}

async function linkIsLive(page: Page, token: string): Promise<boolean> {
  const response = await page.request.get(
    `${QA_CALM_HAVEN_ORIGIN}/api/invitations/lookup?token=${encodeURIComponent(token)}`,
  );
  return response.ok();
}

function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !isKnownBenignConsoleNoise(message.text())) {
      errors.push(message.text());
    }
  });
  return errors;
}

async function evidence(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  // Let enter transitions finish so the capture shows what a person sees, not
  // a half-faded dialog. Infinite ones (a button spinner) never settle.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

/** Opens a confirmation, checks its wording, records it, then cancels it. */
async function askAndCancel(
  page: Page,
  testInfo: TestInfo,
  trigger: Locator,
  expected: { title: string; consequence: RegExp; confirmLabel: string },
  name: string,
): Promise<void> {
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: expected.title });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(expected.consequence);
  await expect(dialog.getByRole("button", { name: expected.confirmLabel })).toBeVisible();
  await evidence(page, testInfo, name);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
}

const REISSUE = {
  title: "Reissue Invitation?",
  consequence: /current link stops working immediately/,
  confirmLabel: "Reissue",
};
const REVOKE = {
  title: "Revoke Invitation?",
  consequence:
    /stops working right away\. If you change your mind, you can send them a new invitation\./,
  confirmLabel: "Revoke",
};

async function openPeople(page: Page, search: string): Promise<void> {
  await page.goto(`${QA_CALM_HAVEN_ORIGIN}/people`);
  const searchbox = page.getByRole("searchbox", { name: "Search people" });
  await searchbox.waitFor({ timeout: 60_000 });
  await searchbox.fill(search);
}

async function openManagementView(page: Page, search: string): Promise<void> {
  await openPeople(page, search);
  await page.getByRole("button", { name: /^On Schedule/ }).click();
  await page.getByRole("option", { name: /^Management/ }).click();
}

function rowFor(page: Page, name: string): Locator {
  return page.getByRole("row").filter({ hasText: name });
}

test.describe("invitation reissue and revoke", () => {
  // Several surfaces and a full page load each; the dev server compiles on
  // first visit, so the default thirty seconds is not a real budget here.
  test.describe.configure({ timeout: 240_000 });

  test("every surface asks once before it acts, and cancelling changes nothing", async ({
    page,
  }, testInfo) => {
    const employeeEmail = fixtureEmail("gate-staff", testInfo);
    const managementEmail = fixtureEmail("gate-mgmt", testInfo);
    await removeFixtures([employeeEmail, managementEmail]);
    const staff = await createEmployeeInvitation(employeeEmail, `Gate ${testInfo.project.name}`);
    await createManagementInvitation(managementEmail, `Gatemgmt ${testInfo.project.name}`);
    const consoleErrors = watchConsole(page);

    try {
      const staffBefore = await readOnlyInvitation(employeeEmail);
      const managementBefore = await readOnlyInvitation(managementEmail);

      await loginAsQaAccount(page, QA_SUPER_ADMIN_EMAIL, QA_CALM_HAVEN_ORIGIN);
      await openPeople(page, "Reissue Gate");
      const row = rowFor(page, `Reissue Gate ${testInfo.project.name}`);
      await row.waitFor({ timeout: 60_000 });

      // The pending row's access select.
      await row.getByRole("button", { name: "User" }).click();
      await page.getByRole("option", { name: "Admin", exact: true }).click();
      const changeAccess = page.getByRole("dialog", { name: "Change invitation access?" });
      await expect(changeAccess).toContainText(
        `Their current invite link stops working immediately, and a new one is sent to ${employeeEmail}.`,
      );
      await expect(changeAccess.getByRole("button", { name: "Change and resend" })).toBeVisible();
      await evidence(page, testInfo, "5-access-select-confirmation");
      await changeAccess.getByRole("button", { name: "Cancel" }).click();
      await expect(changeAccess).toBeHidden();

      // The detail slideover's pending-invitation banner.
      await row.getByRole("cell", { name: "Full-time" }).click();
      const banner = page.getByText("Invitation pending").locator("xpath=../../..");
      await expect(banner).toContainText(employeeEmail);
      await askAndCancel(
        page,
        testInfo,
        page.getByRole("button", { name: "Reinvite" }),
        REISSUE,
        "4a-slideover-reinvite-confirmation",
      );
      await askAndCancel(
        page,
        testInfo,
        page.getByRole("button", { name: "Revoke", exact: true }),
        REVOKE,
        "4b-slideover-revoke-confirmation",
      );
      await page.keyboard.press("Escape");

      // The management panel.
      await openManagementView(page, "Reissue Gatemgmt");
      await rowFor(page, `Reissue Gatemgmt ${testInfo.project.name}`)
        .getByRole("cell")
        .nth(2)
        .click();
      const panel = page.getByRole("dialog", { name: "Management staff detail" });
      await expect(panel).toBeVisible();
      await askAndCancel(
        page,
        testInfo,
        panel.getByRole("button", { name: "Resend Invitation" }),
        REISSUE,
        "1-management-resend-confirmation",
      );
      await askAndCancel(
        page,
        testInfo,
        panel.getByRole("button", { name: "Revoke Invitation" }),
        REVOKE,
        "2-management-revoke-confirmation",
      );

      // The full detail page.
      await page.goto(`${QA_CALM_HAVEN_ORIGIN}/people/${staff.employeeId}`);
      await page.getByText("Invitation pending").first().waitFor({ timeout: 120_000 });
      await askAndCancel(
        page,
        testInfo,
        page.getByRole("button", { name: "Reinvite" }),
        REISSUE,
        "3a-detail-page-reinvite-confirmation",
      );
      await askAndCancel(
        page,
        testInfo,
        page.getByRole("button", { name: "Revoke", exact: true }),
        REVOKE,
        "3b-detail-page-revoke-confirmation",
      );

      // Nine prompts cancelled: neither invitation moved.
      const staffAfter = await readOnlyInvitation(employeeEmail);
      const managementAfter = await readOnlyInvitation(managementEmail);
      expect(staffAfter).toEqual(staffBefore);
      expect(managementAfter).toEqual(managementBefore);
      expect(consoleErrors).toEqual([]);
    } finally {
      await removeFixtures([employeeEmail, managementEmail]);
    }
  });

  test("a confirmed revoke holds against a later resend", async ({ page }, testInfo) => {
    const email = fixtureEmail("revoke", testInfo);
    await removeFixtures([email]);
    const { invitationId } = await createManagementInvitation(
      email,
      `Revoke ${testInfo.project.name}`,
    );
    const consoleErrors = watchConsole(page);

    try {
      const before = await readOnlyInvitation(email);
      expect(await linkIsLive(page, before.token)).toBe(true);

      await loginAsQaAccount(page, QA_SUPER_ADMIN_EMAIL, QA_CALM_HAVEN_ORIGIN);
      await openManagementView(page, "Reissue Revoke");
      await rowFor(page, `Reissue Revoke ${testInfo.project.name}`)
        .getByRole("cell")
        .nth(2)
        .click();
      const panel = page.getByRole("dialog", { name: "Management staff detail" });
      await panel.getByRole("button", { name: "Revoke Invitation" }).click();
      const confirm = page.getByRole("dialog", { name: "Revoke Invitation?" });
      await confirm.getByRole("button", { name: "Revoke" }).click();
      await expect(page.getByText("Invitation revoked")).toBeVisible();
      await evidence(page, testInfo, "revoke-result");

      await expect.poll(async () => (await readOnlyInvitation(email)).revoked_at).not.toBeNull();
      const revoked = await readOnlyInvitation(email);
      expect(revoked.token).toBe(before.token);
      expect(await linkIsLive(page, revoked.token)).toBe(false);

      // A resend of a revoked invitation used to clear revoked_at and hand out
      // a fresh 72 hours. It is sent as the client would send it.
      const orgId = await withDatabase(async (db) => {
        const result = await db.query<{ id: string }>(
          "SELECT id FROM public.organizations WHERE slug = $1",
          [ORG_SLUG],
        );
        return result.rows[0]!.id;
      });
      const listed = await page.request.get(
        `${QA_CALM_HAVEN_ORIGIN}/api/organizations/invitations?orgId=${orgId}`,
      );
      const { invitations } = (await listed.json()) as {
        invitations: Array<{ id: string; updatedAt: string }>;
      };
      const expectedUpdatedAt = invitations.find((item) => item.id === invitationId)?.updatedAt;
      expect(expectedUpdatedAt).toBeTruthy();
      const resend = await page.request.post(
        `${QA_CALM_HAVEN_ORIGIN}/api/organizations/invitations`,
        {
          headers: { Origin: QA_CALM_HAVEN_ORIGIN },
          data: { action: "resend", orgId, invitationId, expectedUpdatedAt },
        },
      );
      expect(resend.ok()).toBe(false);

      const after = await readOnlyInvitation(email);
      expect(after.revoked_at).not.toBeNull();
      expect(after.token).toBe(before.token);
      expect(await linkIsLive(page, after.token)).toBe(false);
      expect(consoleErrors).toEqual([]);

      // The revoked link lands on the dead-link state and never on the form.
      await page.goto(`${QA_CALM_HAVEN_ORIGIN}/accept-invite?token=${after.token}`);
      await expect(page.getByRole("heading", { name: "Invitation no longer valid" })).toBeVisible();
      await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
      await evidence(page, testInfo, "revoked-link-accept-page");
    } finally {
      await removeFixtures([email]);
    }
  });

  for (const surface of ["slideover", "detail page"] as const) {
    test(`reinvite from the ${surface} keeps one live invitation`, async ({ page }, testInfo) => {
      const kind = surface === "slideover" ? "slide" : "page";
      const email = fixtureEmail(`reinvite-${kind}`, testInfo);
      await removeFixtures([email]);
      const lastName = `Reinvite${kind} ${testInfo.project.name}`;
      const { employeeId } = await createEmployeeInvitation(email, lastName);

      try {
        const before = await readOnlyInvitation(email);

        await loginAsQaAccount(page, QA_SUPER_ADMIN_EMAIL, QA_CALM_HAVEN_ORIGIN);
        if (surface === "slideover") {
          await openPeople(page, `Reissue Reinvite${kind}`);
          const row = rowFor(page, `Reissue ${lastName}`);
          await row.waitFor({ timeout: 60_000 });
          await row.getByRole("cell", { name: "Full-time" }).click();
        } else {
          await page.goto(`${QA_CALM_HAVEN_ORIGIN}/people/${employeeId}`);
        }
        await page.getByText("Invitation pending").first().waitFor({ timeout: 120_000 });

        await page.getByRole("button", { name: "Reinvite" }).click();
        const confirm = page.getByRole("dialog", { name: "Reissue Invitation?" });
        const resend = page.waitForResponse(
          (response) =>
            response.url().endsWith("/api/organizations/invitations") &&
            response.request().method() === "POST",
        );
        await confirm.getByRole("button", { name: "Reissue" }).click();
        const delivered = (await resend).ok();
        await expect(confirm).toBeHidden();
        await evidence(page, testInfo, `reinvite-${kind}-result`);

        // Never a revoke and never a second invitation: the old handler did
        // both and then opened the invite modal.
        const after = await readOnlyInvitation(email);
        expect(after.id).toBe(before.id);
        expect(after.revoked_at).toBeNull();
        await expect(page.getByRole("dialog", { name: /invite/i })).toHaveCount(0);
        if (delivered) {
          expect(after.token).not.toBe(before.token);
          expect(await linkIsLive(page, before.token)).toBe(false);
        } else {
          expect(after.token).toBe(before.token);
        }
        expect(await linkIsLive(page, after.token)).toBe(true);

        // The live link still reaches the form, named for its organization.
        await page.goto(`${QA_CALM_HAVEN_ORIGIN}/accept-invite?token=${after.token}`);
        await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
        await expect(page.getByText("Calm Haven").first()).toBeVisible();
      } finally {
        await removeFixtures([email]);
      }
    });
  }

  test("changing a pending invitation's access keeps one invitation and one audit entry", async ({
    page,
  }, testInfo) => {
    const email = fixtureEmail("access", testInfo);
    await removeFixtures([email]);
    const lastName = `Access ${testInfo.project.name}`;
    const { invitationId } = await createEmployeeInvitation(email, lastName);

    try {
      const before = await readOnlyInvitation(email);
      const auditBefore = await auditActions(invitationId);

      await loginAsQaAccount(page, QA_SUPER_ADMIN_EMAIL, QA_CALM_HAVEN_ORIGIN);
      await openPeople(page, "Reissue Access");
      const row = rowFor(page, `Reissue ${lastName}`);
      await row.waitFor({ timeout: 60_000 });
      await row.getByRole("button", { name: "User" }).click();
      await page.getByRole("option", { name: "Admin", exact: true }).click();
      const confirm = page.getByRole("dialog", { name: "Change invitation access?" });
      const replace = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/organizations/invitations") &&
          response.request().method() === "POST",
      );
      await confirm.getByRole("button", { name: "Change and resend" }).click();
      const delivered = (await replace).ok();
      if (delivered) {
        await expect(confirm).toBeHidden();
      } else {
        // The dialog stays open on a failed send so the change can be retried.
        await expect(page.getByText("We couldn't send that invitation email.")).toBeVisible();
      }
      await evidence(page, testInfo, "access-change-result");
      if (!delivered) await confirm.getByRole("button", { name: "Cancel" }).click();

      const after = await readOnlyInvitation(email);
      expect(after.id).toBe(before.id);
      expect(after.revoked_at).toBeNull();
      expect(await linkIsLive(page, after.token)).toBe(true);
      const auditAdded = (await auditActions(invitationId)).slice(auditBefore.length);
      expect(auditAdded).not.toContain("invitation.revoked");
      expect(auditAdded).not.toContain("invitation.created");
      if (delivered) {
        expect(after.role_to_assign).toBe("admin");
        expect(after.token).not.toBe(before.token);
        expect(auditAdded.filter((action) => action === "invitation.access_replaced")).toHaveLength(
          1,
        );
      } else {
        // Delivery failed, so the previous link and access are restored.
        expect(after.role_to_assign).toBe("user");
        expect(after.token).toBe(before.token);
      }
    } finally {
      await removeFixtures([email]);
    }
  });

  test("sending an invitation creates and emails it in one step", async ({ page }, testInfo) => {
    const email = fixtureEmail("send", testInfo);
    await removeFixtures([email]);
    const lastName = `Send ${testInfo.project.name}`;
    await createEmployee(email, lastName);

    try {
      await loginAsQaAccount(page, QA_SUPER_ADMIN_EMAIL, QA_CALM_HAVEN_ORIGIN);
      await openPeople(page, "Reissue Send");
      const row = rowFor(page, `Reissue ${lastName}`);
      await row.waitFor({ timeout: 60_000 });
      await row.getByRole("cell", { name: "Full-time" }).click();
      await page.getByRole("button", { name: "Send invitation" }).click();

      const invite = page.getByRole("dialog", { name: /^Invite / });
      const create = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/organizations/invitations/create") &&
          response.request().method() === "POST",
      );
      await invite.getByRole("button", { name: "Send Invitation" }).click();
      const delivered = (await create).ok();
      await evidence(page, testInfo, "send-invitation-result");

      // The email and the invitation succeed or fail together: never a live
      // invitation whose link nobody received (finding F-10).
      const rows = await readInvitations(email);
      if (delivered) {
        expect(rows).toHaveLength(1);
        expect(await linkIsLive(page, rows[0]!.token)).toBe(true);
      } else {
        expect(rows).toHaveLength(0);
        await expect(invite.getByText(/couldn't send|not configured/i)).toBeVisible();
      }
    } finally {
      await removeFixtures([email]);
    }
  });
});
