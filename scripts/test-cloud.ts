import "../src/env";
process.env.DISABLE_CLOUD_SYNC = "false";
import { getProfilesCloud, getTrendingCoinsCloud, getSessionStateCloud } from "../src/storage";

async function main() {
  console.log("Testing cloud sync...");
  try {
    const profiles = await getProfilesCloud();
    console.log("Profiles in cloud:", profiles?.length || 0);
    if (profiles && profiles.length > 0) {
      console.log("First profile:", profiles[0].name, profiles[0].id);
      const coins = await getTrendingCoinsCloud(profiles[0].id);
      console.log("Coins for first profile:", coins?.length || 0);
    }
  } catch (e: any) {
    console.error("Cloud test error:", e?.message || e);
  }
  process.exit(0);
}

main();
