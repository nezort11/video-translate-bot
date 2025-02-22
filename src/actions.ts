/**
 * Screen Router Navigation Action System
 *
 * - createRouter: router - [router id]
 * - createActionButton: action - [router id]/[action id]
 * - route(router) - render screen
 * - navigate(screen) - change screen
 *
 * session:
 * - routers
 *
 * routers:
 * - router
 *
 * router
 * - screen: enum (current screen)
 * - session: object (router state data)
 * - actions: object (current actions)
 *
 * actions:
 * - type: enum
 * - actionData: object
 */
import { Markup } from "telegraf";
import type {
  SceneContext,
  WizardSession,
  WizardSessionData,
} from "telegraf/typings/scenes";
// // @ts-expect-error nanoid@3 is commonjs no esm
import { nanoid } from "nanoid";
import type { BotContext } from "./botinstance";

export enum Screen {
  Translate = "TRANSLATE",
  LanguageSettings = "LANGUAGE_SETTINGS",
  Settings = "SETTINGS",
}

export enum ActionType {
  Navigate = "NAVIGATE",

  Translate = "TRANSLATE",
  TranslateVoice = "TRANSLATE_VOICE",
  TranslateAudio = "TRANSLATE_AUDIO",
  TranslateVideo = "TRANSLATE_VIDEO",
  ChooseLanguage = "CHOOSE_LANGUAGE",
}

export interface ActionDataBase<T extends ActionType> {
  type: T;
}

// Action Data Types
export type NavigateActionData = ActionDataBase<ActionType.Navigate> & {
  screen: Screen;
};

export type TranslateActionData = ActionDataBase<ActionType.Translate> & {
  link: string;
};

export type ChooseLanguageActionData =
  ActionDataBase<ActionType.ChooseLanguage> & {
    language: string;
  };

export type ActionData =
  | NavigateActionData
  | ActionDataBase<ActionType.TranslateVoice>
  | ActionDataBase<ActionType.TranslateAudio>
  | ActionDataBase<ActionType.TranslateVideo>
  | TranslateActionData
  | ChooseLanguageActionData;

export interface Router {
  id: string;
  screen?: Screen;
  session: any;
  actions: Record<string, ActionData>;
}

type ActionPayload = {
  routerId: string; // aggregational identifier used to group union actions (to clear irrelevant actions)
  actionId: string; // identifier of the specific action created
};

export type SceneActionSession = WizardSession<WizardSessionData> & {
  language?: string;

  routers?: Record<string, Router>;

  translateLanguage?: string;
};

export type SceneActionContext = Omit<SceneContext, "session"> & {
  session?: SceneActionSession;
};

export const generateUniqueId = () => {
  return nanoid(8);
};

export const createRouter = (
  context: BotContext,
  defaultScreen?: Screen,
  defaultSession?: any
) => {
  const routerId = generateUniqueId();

  context.session ??= {};
  context.session.routers ??= {};
  const router = {
    id: routerId,
    screen: defaultScreen,
    // define empty {} router .session and .actions
    session: { ...defaultSession },
    actions: {},
  };
  context.session.routers[routerId] = router;

  return router;
};

export const clearRouterActions = (context: BotContext, routerId: string) => {
  // case must be present, so reset the actions
  context.session.routers![routerId].actions = {};
};

export const getActionData = <T extends ActionType>(
  context: BotContext,
  routerId: string,
  actionId: string
) => {
  const actionData = context.session?.routers?.[routerId]?.actions?.[actionId];

  if (actionData) {
    // Automatically cleanup all other irrelevant actions in the action group
    // clearActionGroup(context, actionGroupId);
    clearRouterActions(context, routerId);
  }

  return actionData;
};

export const getRouter = (context: BotContext, routerId: string) => {
  const router = context.session.routers![routerId];
  return router;
};

export const setActionData = (
  context: BotContext,
  routerId: string,
  actionId: string,
  data: ActionData
) => {
  // router with the provided routerId must exist
  context.session.routers![routerId].actions[actionId] = data;
};

export const setRouterSessionData = (
  context: BotContext,
  routerId: string,
  key: string,
  data: string
) => {
  context.session.routers![routerId].session[key] = data;
};

export const getRouterSessionData = (
  context: BotContext,
  routerId: string,
  key: string
) => {
  return context.session.routers![routerId].session[key];
};

const encodeActionPayload = (data: ActionPayload) => {
  return `${data.routerId},${data.actionId}`;
};

export const decodeActionPayload = (
  actionCallbackData: string
): ActionPayload => {
  const [routerId, actionId] = actionCallbackData.split(",");
  return { routerId, actionId };
};

export interface CreateActionArgs {
  context: BotContext;
  routerId: string;
  data: ActionData;
}

// Create new action and return serialized callback data
export const createAction = ({ context, routerId, data }: CreateActionArgs) => {
  const actionId = generateUniqueId();
  setActionData(context, routerId, actionId, data);
  return encodeActionPayload({ routerId, actionId });
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
