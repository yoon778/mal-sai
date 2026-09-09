// Time-dependent facts are computed from the virtual clock, including saved games.
export function clockContext(game) {
  const absolute = game.scenario.startMinute + game.minute;
  const current = `${Math.floor(absolute / 1440)}일 후 ${String(Math.floor(absolute % 1440 / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
  return { current, elapsedMinutes: game.minute,
    ...(game.scenario.id === 'after-date' ? { schedule: absolute < 21 * 60 ? '첫날 21시까지 내 업무가 남아 있다' : '첫날 21시 업무 종료 예정 시각이 지났다 추가 업무나 바쁨을 임의로 만들지 않는다' } : {}),
    ...(game.scenario.id === 'busy-break' ? { schedule: game.minute < 120 ? `시작할 때 들어간 회의가 끝나기까지 ${120 - game.minute}분 남았다` : '시작할 때 들어간 두 시간 회의의 종료 예정 시각이 지났다 새 회의가 시작됐다고 임의로 만들지 않는다' } : {}),
  };
}

export function partnerFacts(game) {
  if (game.scenario.id === 'busy-break') return { facts: '연습 시작 시 두 시간짜리 회의에 들어갔다 회의 중에는 길게 답하기 어렵다 현재 회의 상태는 virtualClock에 표시돼 있다', roleRule: '회의 중인 사람은 나다 회의 시작은 연습 시작 시각이고 지금부터 다시 두 시간을 세지 않는다' };
  if (game.scenario.id !== 'after-date') return { facts: game.scenario.facts, roleRule: game.scenario.roleRule ?? '' };
  // Overrides legacy snapshots containing a fixed "현재 19시" rule as well.
  return { facts: '나는 영화와 동네 산책을 좋아한다 첫날 업무 종료 예정은 21시다 만남 약속은 대화에서 실제 합의한 내용만 따른다',
    roleRule: `업무가 남아 있던 사람은 나이고 사용자는 아니다 현재 일정은 virtualClock을 따른다 사용자의 일과 바꾸어 말하지 않는다` };
}
