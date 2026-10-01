import { Landing } from "@/components/Landing";
import { tournamentLogos } from "@/lib/logos";

export default function Home() {
  return <Landing logos={tournamentLogos()} />;
}
