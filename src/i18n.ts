import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      app_title: "TecPlanning",
      create_room: "Create Game",
      room_name: "Game Name",
      your_name: "Your Name",
      join_as_spectator: "Join as spectator (no voting)",
      loading: "Creating...",
      room_not_found: "Oops!",
      room_not_found_desc: "Room not found or has been closed.",
      return_home: "Go Home",
      join_room: "Join Game",
      enter_room: "Join Game",
      spectators: "Spectators",
      copied: "Copied!",
      copy_link: "Invite Link",
      reveal_cards: "Reveal Cards",
      start_new_voting: "Start New Voting",
      average: "Average",
      voting_in_progress: "Voting in progress...",
      you: "You",
      pick_your_card: "Choose your card",
      placeholder_room_name: "e.g. Sprint 42 Planning",
      placeholder_user_name: "e.g. John Doe",
      start_session_desc: "Start a new planning poker session",
      table: "Table",
      player_one: "player",
      player_other: "players",
      spectator_one: "spectator",
      spectator_other: "spectators",
      leave_game: "Leave Game",
      toggle_language: "Toggle Language",
      toggle_theme: "Toggle Theme",
      agreement: "Agreement",
      vote_one: "vote",
      vote_other: "votes",
      total_coherence: "Total coherence"
    }
  },
  pt: {
    translation: {
      app_title: "TecPlanning",
      create_room: "Criar Jogo",
      room_name: "Nome do Jogo",
      your_name: "Seu Nome",
      join_as_spectator: "Entrar como espectador (sem voto)",
      loading: "Criando...",
      room_not_found: "Ops!",
      room_not_found_desc: "Sala não encontrada ou foi fechada.",
      return_home: "Voltar ao Início",
      join_room: "Entrar no Jogo",
      enter_room: "Entrar",
      spectators: "Espectadores",
      copied: "Copiado!",
      copy_link: "Link de Convite",
      reveal_cards: "Revelar Cartas",
      start_new_voting: "Nova Votação",
      average: "Média",
      voting_in_progress: "Votação em andamento...",
      you: "Você",
      pick_your_card: "Escolha sua carta",
      placeholder_room_name: "ex. Planejamento da Sprint 42",
      placeholder_user_name: "ex. João Silva",
      start_session_desc: "Inicie uma nova sessão de planning poker",
      table: "Mesa",
      player_one: "jogador",
      player_other: "jogadores",
      spectator_one: "espectador",
      spectator_other: "espectadores",
      leave_game: "Sair do Jogo",
      toggle_language: "Mudar Idioma",
      toggle_theme: "Mudar Tema",
      agreement: "Concordância",
      vote_one: "voto",
      vote_other: "votos",
      total_coherence: "Concordância total"
    }
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: "en",
    fallbackLng: "en",
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
