import { ObjectType, Field, ID, Int, Float } from '@nestjs/graphql';

@ObjectType()
export class FlowStep {
  @Field(() => ID)
  id: string;

  @Field()
  type: string;

  @Field({ nullable: true })
  connector?: string;

  @Field({ nullable: true })
  action?: string;

  @Field(() => [String], { nullable: true })
  depends_on?: string[];

  @Field({ nullable: true })
  condition?: string;
}

@ObjectType()
export class Flow {
  @Field(() => ID)
  id: string;

  @Field()
  workspace_id: string;

  @Field()
  name: string;

  @Field({ nullable: true })
  description?: string;

  @Field(() => [FlowStep])
  steps: FlowStep[];

  @Field()
  created_at: Date;

  @Field()
  updated_at: Date;

  @Field()
  is_active: boolean;
}

@ObjectType()
export class EventData {
  @Field(() => ID)
  id: string;

  @Field()
  tenant_id: string;

  @Field({ nullable: true })
  source?: string;

  @Field()
  event_type: string;

  @Field(() => String)
  data: string;

  @Field()
  created_at: Date;
}

@ObjectType()
export class FlowRun {
  @Field(() => ID)
  id: string;

  @Field()
  flow_id: string;

  @Field()
  status: string;

  @Field(() => Int)
  duration_ms: number;

  @Field({ nullable: true })
  error?: string;

  @Field()
  started_at: Date;

  @Field()
  completed_at: Date;
}

@ObjectType()
export class Workspace {
  @Field(() => ID)
  id: string;

  @Field()
  name: string;

  @Field()
  created_at: Date;

  @Field()
  updated_at: Date;
}

@ObjectType()
export class User {
  @Field(() => ID)
  id: string;

  @Field()
  email: string;

  @Field()
  created_at: Date;

  @Field()
  updated_at: Date;
}

@ObjectType()
export class EventPattern {
  @Field(() => ID)
  id: string;

  @Field()
  pattern_type: string;

  @Field()
  description: string;

  @Field(() => Float)
  confidence: number;

  @Field()
  frequency: string;

  @Field(() => [String])
  events_involved: string[];

  @Field({ nullable: true })
  suggested_trigger?: string;

  @Field(() => [String])
  suggested_actions: string[];
}
