import WorkspaceLayout from "@/app/analysis-targets/[targetId]/layout";
import { AppShell } from "@/components/shared/AppShell";
import { requirePageUser } from "@/services/auth/access-control";

jest.mock("@/services/auth/access-control", () => ({ requirePageUser: jest.fn() }));
jest.mock("@/components/shared/AppShell", () => ({ AppShell: jest.fn() }));

it("verifies the workspace session before supplying the sidebar owner", async () => {
  jest
    .mocked(requirePageUser)
    .mockResolvedValue({ id: "verified-owner", email: "melissa@example.com" });
  const children = <p>Workspace content</p>;
  const layout = WorkspaceLayout({ children, params: Promise.resolve({ targetId: "target-id" }) });
  // Resolve the async server boundary as Next does, without mounting it in jsdom.
  const boundary = layout.props.children;
  const shell = await boundary.type(boundary.props);
  expect(requirePageUser).toHaveBeenCalledWith("/analysis-targets/target-id");
  expect(shell.type).toBe(AppShell);
  expect(shell.props).toEqual({ userId: "verified-owner", email: "melissa@example.com", children });
});

it("propagates an unauthenticated redirect before returning any protected shell", async () => {
  jest.mocked(requirePageUser).mockRejectedValue(new Error("NEXT_REDIRECT"));
  const layout = WorkspaceLayout({
    children: <p>Private content</p>,
    params: Promise.resolve({ targetId: "target-id" }),
  });
  const boundary = layout.props.children;
  await expect(boundary.type(boundary.props)).rejects.toThrow("NEXT_REDIRECT");
  expect(AppShell).not.toHaveBeenCalled();
});
