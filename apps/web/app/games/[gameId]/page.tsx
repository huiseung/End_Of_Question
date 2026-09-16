import { Game } from '../../../components/game';
export default async function GamePage({ params }: { params: Promise<{ gameId: string }> }) {
  return <Game gameId={(await params).gameId}/>;
}
