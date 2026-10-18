import { handleCommunity, type CommunityEnv } from '../../server/community.ts';
export const onRequest = ({request,env}:{request:Request;env:CommunityEnv}):Promise<Response> => handleCommunity(request,env);
