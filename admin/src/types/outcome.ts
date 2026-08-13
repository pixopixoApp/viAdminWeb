export type OutcomeAction = 'continue' | 'goto' | 'replay'

export type OutcomeEdge = {
  action: OutcomeAction
  clip_id?: string
}

export type Outcomes = {
  success?: OutcomeEdge
  fail?: OutcomeEdge
}
