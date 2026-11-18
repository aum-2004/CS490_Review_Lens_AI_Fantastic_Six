/** @jest-environment node */
import { revalidatePath } from "next/cache";
import { authenticate, endSession } from "@/services/auth/auth-service";
import { register, signIn, signOut } from "@/app/login/actions";

jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/services/auth/auth-service", () => ({
  authenticate: jest.fn(),
  endSession: jest.fn(),
}));
beforeEach(() => jest.resetAllMocks());

it("passes untrusted input to the validating service and revalidates only after success", async () => {
  jest
    .mocked(authenticate)
    .mockResolvedValueOnce({ success: false })
    .mockResolvedValueOnce({ success: true });
  await signIn(null);
  expect(revalidatePath).not.toHaveBeenCalled();
  await signIn({ email: "a@example.com", password: "dummy" });
  expect(authenticate).toHaveBeenLastCalledWith(
    { email: "a@example.com", password: "dummy" },
    "sign-in",
  );
  expect(revalidatePath).toHaveBeenCalledWith("/login", "page");
});
it("delegates registration to the provider service", async () => {
  jest.mocked(authenticate).mockResolvedValue({ success: true, requiresConfirmation: true });
  expect(await register({})).toMatchObject({ requiresConfirmation: true });
  expect(authenticate).toHaveBeenCalledWith({}, "register");
});
it("invalidates cached navigation after successful logout", async () => {
  jest.mocked(endSession).mockResolvedValue({ success: true });
  await signOut();
  expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
});
it("does not invalidate navigation or report success after failed logout", async () => {
  jest.mocked(endSession).mockResolvedValue({ success: false });
  expect((await signOut()).success).toBe(false);
  expect(revalidatePath).not.toHaveBeenCalled();
});
