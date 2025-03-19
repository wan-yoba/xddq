import GameNetMgr from "#game/net/GameNetMgr.js";
import Protocol from "#game/net/Protocol.js";
import logger from "#utils/logger.js";
import LoopMgr from "#game/common/LoopMgr.js";
import UnionMgr from '#game/mgr/UnionMgr.js';
import DBMgr from "#game/common/DBMgr.js";
import UserMgr from "#game/mgr/UserMgr.js";

export default class UnionBountyMgr {
    constructor() {
        this.unionId = null;                // 妖盟ID
        this.bountyTimes = 0;               // 悬赏时间
        this.helpTimes = 0;                 // 协助时间
        this.cartList = [];                 // 运镖车辆
        this.monsterList = null;            // 怪兽列表
        this.worshipRedPoint = false;       // 崇拜红点
        this.repointRedPoint = false;       // 是否领取悬赏奖励
        this.groupType = 0;                 // 押送类型1:普通，怪兽不知道呢
        this.myCart = null;                 // 自己的押送车
        this.CHECK_CD = 1000 * 60 * 10;     // 每次间隔时间
        this.lastCheckTime = 0;             // 上次检查时间
    }

    static get inst() {
        if (!this._instance) {
            this._instance = new UnionBountyMgr();
        }
        return this._instance;
    }

    reset() {
        this._instance = null;
    }

    clear() {
        LoopMgr.inst.remove(this);
    }

    // 推送妖盟数据
    pushMyUnionDataBroadcast(t) {
        this.unionId = t.baseData.unionId || null;
    }

    // 进入悬赏地图
    UnionBountyEnterMapReq() {
        GameNetMgr.inst.sendPbMsg(Protocol.S_UNION_BOUNTY_ENTRY_MAP, {});
    }

    // 获取悬赏信息（这里会同步多次，数据可能不一致）
    UnionBountyEnterMapResp(t) {
        this.bountyTimes = t.playerData.bountyTimes;
        this.helpTimes = t.playerData.helpTimes;
        this.cartList = t.cartList;
        this.monsterList = t.monsterList || null;
        this.myCart = t.myCart || null;
        this.worshipRedPoint = t.worshipRedPoint;
        this.repointRedPoint = t.repointRedPoint;
        this.groupType = t.groupType;
    }

    // 排行榜膜拜
    UnionBountyWorshipReq() {
        GameNetMgr.inst.sendPbMsg(Protocol.S_UNION_BOUNTY_WORSHIP, {});
        this.worshipRedPoint = true;
        logger.info(`[妖盟悬赏] 排行榜膜拜已完成`)
    }

    // 请求打开悬赏界面
    UnionBountyOpenBountyEventReq() {
        GameNetMgr.inst.sendPbMsg(Protocol.S_UNION_BOUNTY_OPEN_BOUNTY_EVENT, {});
    }

    // 押镖界面返回&启动押镖
    async UnionBountyOpenBountyEventResp(t) {
        // 玩家数据同步
        this.bountyTimes = t.playerData.bountyTimes;
        this.helpTimes = t.playerData.helpTimes;

        // 当前配置ID
        const curConfigId = t.bountyInfo.curConfigId;
        // 当为异兽镇压时，此字段不为空
        const monsterPower = t.bountyInfo.monsterPower;
        // 当悬赏完成时，此字段不为空
        const finishReward = t.bountyInfo.finishReward;

        // 先判断是否完成，完成了就领取奖励
        if (finishReward) {
            // 领取悬赏奖励
            this.UnionBountyGetRewardEscortReq(finishReward);
        } else {
            // 如果是镇压异兽,打开异兽界面
            if (monsterPower) {
                GameNetMgr.inst.sendPbMsg(Protocol.S_UNION_BOUNTY_OPEN_MONSTER, { playerId: UserMgr.playerId });
            }


            if (this.myCart == null && this.bountyTimes < 2) {
                logger.info(`[妖盟悬赏] 开始押送悬赏`)
                GameNetMgr.inst.sendPbMsg(Protocol.S_UNION_BOUNTY_DEAL_BOUNTY, { curConfigId: curConfigId, type: this.groupType });
                this.bountyTimes += 1;
            }
        }
    }

    // 妖兽打开后,返回结果，处理妖兽镇压
    async UnionBountyOpenMonsterResp(t) {
        logger.error(`[妖盟悬赏] 妖盟悬赏为，异兽镇压，目前暂无法处理异兽镇压的数据请求，请手动处理`);

        const joinPeople = t.headAndFightMsg.length;
        // 是否要判断加入人数3才开始镇压，这里自己请求返回则为0,别人请求则为实际的玩家数据,不好搞
        if (joinPeople === 3) {
            // 返回结果后，这里如果是自己请求，无法知道参与人数
            const teamPlayerList = t.headAndFightMsg?.map((item, index) => {
                return {
                    playerId: item.headInfo?.headInfo?.playerId,
                    pos: index
                }
            });

            const bossId = t.battleMainList?.find(item => Number(UserMgr.playerId) == Number(item.playerId))?.objId;
            GameNetMgr.inst.sendPbMsg(Protocol.S_UNION_BOUNTY_ATTACK_MONSTER, { teamPlayerList, bossId });
        }
    }

    // 领取悬赏奖励
    UnionBountyGetRewardEscortReq(finishReward) {
        logger.info(`[妖盟悬赏] 领取悬赏奖励`)
        GameNetMgr.inst.sendPbMsg(Protocol.S_UNION_BOUNTY_GET_REWARD_ESCORT, {});

        const reward = finishReward?.reward.split('|');
        logger.info(`[妖盟悬赏] 悬赏完成,奖励领取,奖励内容:${reward.map(element => {
            const [key, value] = element.split('=');
            return `${DBMgr.inst.getLanguageWord(`Items-${key}`)}:${value}`
        })}`);
    }

    async loopUpdate() {
        if (this.isProcessing) return;
        this.isProcessing = true;
        try {
            const inUnion = UnionMgr.inst.inUnion()
            if (!inUnion) {
                logger.info("[妖盟悬赏] 未加入妖盟");
                this.clear();
                return;
            }

            // 检查cd间隔
            const now = new Date();
            if (now.getHours() < 8 || now.getHours() > 22) {
                return;
            }
            if (now - this.lastCheckTime < this.CHECK_CD) {
                return;
            }
            this.lastCheckTime = now;

            logger.info(`[妖盟悬赏] 开始检查妖盟悬赏进度`);
            // 进入悬赏地图（已经10分钟一次了，没必要再初始化标识）
            this.UnionBountyEnterMapReq();
            // sleep 2秒确保同步数据准确
            await new Promise(resolve => setTimeout(resolve, 2000));

            // 排行榜膜拜
            if (this.worshipRedPoint) {
                this.UnionBountyWorshipReq();
                // sleep 0.5秒
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            // 不管条件，都请求打开悬赏栏
            this.UnionBountyOpenBountyEventReq();
            // sleep 2秒等待悬赏返回结果处理
            await new Promise(resolve => setTimeout(resolve, 2000));


            // 加入悬赏队伍，可遇不可求~
            if (null != this.monsterList) {
                // TODO: 加入悬赏队伍，可遇不可求
            }
        } catch (error) {
            logger.error(`[妖盟悬赏] loopUpdate error: ${error}`);
        } finally {
            this.isProcessing = false;
        }
    }
}
