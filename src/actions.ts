import { Markup } from "telegraf";
import type {
  SceneContext,
  WizardSession,
  WizardSessionData,
} from "telegraf/typings/scenes";
// // @ts-expect-error nanoid@3 is commonjs no esm
import { nanoid } from "nanoid";
import type { BotContext } from "./botinstance";

export enum ActionType {
  TranslateVoice = "TRANSLATE_VOICE",
  TranslateAudio = "TRANSLATE_AUDIO",
}

interface ActionDataBase<T extends ActionType> {
  type: T;
  previousData?: ActionData;
}

type TranslateLinkActionData = {
  link: string;
};

export type TranslateVoiceActionData =
  ActionDataBase<ActionType.TranslateVoice> & TranslateLinkActionData;

export type TranslateAudioActionData =
  ActionDataBase<ActionType.TranslateAudio> & TranslateLinkActionData;

type ActionTypeToActionDataMap = {
  [ActionType.TranslateVoice]: TranslateVoiceActionData;
  [ActionType.TranslateAudio]: TranslateAudioActionData;
};

export type ActionData = TranslateVoiceActionData | TranslateAudioActionData;

type ActionPayload = {
  actionGroupId: string; // aggregational identifier used to group union actions (to clear irrelevant actions)
  actionId: string; // identifier of the specific action created
};

// extend scenes session property
export type SceneActionSession = WizardSession<WizardSessionData> & {
  actionData?: {
    [actionGroupId: string]: {
      [actionId: string]: ActionData;
    };
  };
};

export type SceneActionContext = Omit<SceneContext, "session"> & {
  session?: SceneActionSession;
};

export const generateActionId = () => {
  return nanoid(8);
};

export const clearActionGroup = (
  context: BotContext,
  actionGroupId: string
) => {
  delete context.session?.actionData?.[actionGroupId];
};

export const getActionData = <T extends ActionType>(
  context: BotContext,
  actionGroupId: string,
  actionId: string
) => {
  const actionData = context.session?.actionData?.[actionGroupId]?.[
    actionId
  ] as ActionTypeToActionDataMap[T] | undefined;

  if (actionData) {
    // Automatically cleanup all other irrelevant actions in the action group
    clearActionGroup(context, actionGroupId);
  }

  return actionData;
};

export const setActionData = (
  context: BotContext,
  actionId: string,
  data: ActionData
) => {
  const actionGroupId = context.update.update_id;
  context.session ??= {};
  context.session.actionData ??= {};
  context.session.actionData[actionGroupId] ??= {};
  context.session.actionData[actionGroupId][actionId] = data;
};

const encodeActionPayload = (data: ActionPayload) => {
  return `${data.actionGroupId},${data.actionId}`;
};

export const decodeActionPayload = (
  actionCallbackData: string
): ActionPayload => {
  const [actionGroupId, actionId] = actionCallbackData.split(",");
  return { actionGroupId, actionId };
};

export interface CreateActionArgs {
  context: BotContext;
  data: ActionData;
}

// Create new action and return serialized callback data
export const createAction = ({ context, data }: CreateActionArgs) => {
  const actionGroupId = `${context.update.update_id}`;
  const actionId = generateActionId();

  setActionData(context, actionId, data);
  return encodeActionPayload({ actionGroupId, actionId });
};

// Wrap around Markup.button.callback to automatically create callback data for action
export const createActionButton = (
  text: string,
  actionArgs: CreateActionArgs,
  hide = false
) => {
  const callbackData = createAction(actionArgs);
  return Markup.button.callback(text, callbackData, hide);
};
