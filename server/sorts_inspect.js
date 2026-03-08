const d = JSON.parse(require('fs').readFileSync('sorts_tmp.json','utf8'));
d.sorts.slice(0,8).forEach(s => {
  console.log(s.id, '| typeId:', s.gameSetTypeId, '| targetId:', s.gameSetTargetId, '| primarySortId:', s.primarySortId);
});
