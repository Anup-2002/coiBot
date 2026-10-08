import { describe, it, expect } from "vitest";
import { api } from "../src/api";

describe("Frontend API Client Structure", () => {
  it("defines standard client methods", () => {
    expect(typeof api.getStatus).toBe("function");
    expect(typeof api.getProfiles).toBe("function");
    expect(typeof api.activateProfile).toBe("function");
    expect(typeof api.saveProfile).toBe("function");
    expect(typeof api.deleteProfile).toBe("function");
    expect(typeof api.clearSession).toBe("function");
    expect(typeof api.updateProfileLimit).toBe("function");
    expect(typeof api.setContinuousLoop).toBe("function");
    expect(typeof api.retrySingle).toBe("function");
    expect(typeof api.checkSystem).toBe("function");
  });
});
