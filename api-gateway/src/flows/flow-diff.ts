export type StepDiff = {
  added_nodes: string[];
  removed_nodes: string[];
  changed_nodes: string[];
};

function byIdMap(steps: any[] = []) {
  const m: Record<string, any> = {};
  for (const s of steps) {
    if (s && s.id) m[s.id] = s;
  }
  return m;
}

export function diffFlowDefinitions(baseDef: any, compareDef: any): StepDiff {
  // baseDef = older version, compareDef = newer/current
  const baseSteps = Array.isArray(baseDef?.steps) ? baseDef.steps : [];
  const cmpSteps = Array.isArray(compareDef?.steps) ? compareDef.steps : [];

  const baseMap = byIdMap(baseSteps);
  const cmpMap = byIdMap(cmpSteps);

  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  // detect added and changed (in compareDef)
  for (const id of Object.keys(cmpMap)) {
    if (!baseMap[id]) {
      added.push(id);
    } else {
      const a = JSON.stringify(baseMap[id]);
      const b = JSON.stringify(cmpMap[id]);
      if (a !== b) changed.push(id);
    }
  }

  // detect removed (present in base but not in compare)
  for (const id of Object.keys(baseMap)) {
    if (!cmpMap[id]) removed.push(id);
  }

  return { added_nodes: added, removed_nodes: removed, changed_nodes: changed };
}

export default diffFlowDefinitions;
