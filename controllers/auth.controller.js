'use strict';
import db, { pool } from "../config/db.js";
import { checkIsManagerUrl, returnMoment } from "../utils.js/function.js";
import { insertQuery, updateQuery } from "../utils.js/query-util.js";
import { createHashedPassword, checkLevel, makeUserToken, response, checkDns, lowLevelException, settingFiles, getReqIp } from "../utils.js/util.js";
import 'dotenv/config';

const authCtrl = {
    signIn: async (req, res, next) => {
        try {
            let is_manager = await checkIsManagerUrl(req);
            const decode_user = checkLevel(req.cookies.token, 0);

            let { user_name, user_pw } = req.body;

            let user = await pool.query(`SELECT * FROM users WHERE user_name=? AND is_delete=0 LIMIT 1`, user_name);
            user = user?.result[0];
            if (!user) {
                return response(req, res, -100, "가입되지 않은 회원입니다.", {})
            }
            if (is_manager && user.level < 10) {
                return response(req, res, -100, "가입되지 않은 회원입니다.", {})
            }
            if (user?.status == 1) {
                return response(req, res, -100, "승인 대기중입니다.", {})
            }
            if (user?.status == 2) {
                return response(req, res, -100, "로그인 불가 회원입니다.", {})
            }
            user_pw = (await createHashedPassword(user_pw, user.user_salt)).hashedPassword;
            if (user_pw != user.user_pw) {
                return response(req, res, -100, "가입되지 않은 회원입니다.", {})
            }
            let requestIp = getReqIp(req);
            if (user?.level >= 50) {
                let developer_ip_list = [
                    '183.107.112.147',
                    '59.26.14.23',
                ]
                if (!developer_ip_list.includes(requestIp)) {
                    return response(req, res, -150, "권한이 없습니다.", {})
                }
            }
            let user_obj = {
                id: user.id,
                user_name: user.user_name,
                nickname: user.nickname,
                level: user.level,
                phone_num: user.phone_num,
                profile_img: user.profile_img,
            }
            const token = makeUserToken(user_obj)
            await res.cookie("token", token, {
                httpOnly: true,
                maxAge: (60 * 60 * 1000) * 3,
                //sameSite: 'none', 
                //secure: true 
            });
            let check_last_login_time = await updateQuery('users', {
                last_login_time: returnMoment()
            }, user.id)

            return response(req, res, 100, "success", user_obj)
        } catch (err) {
            console.log(err)
            return response(req, res, -200, "서버 에러 발생", false)
        } finally {

        }
    },
    signUp: async (req, res, next) => {
        try {
            let is_manager = await checkIsManagerUrl(req);
            const decode_user = checkLevel(req.cookies.token, 0);
            let {
                user_name,
                user_pw,
                nickname,
                level = 0,
                phone_num,
                profile_img,
            } = req.body;
            console.log(req.body)
            if (!user_pw) {
                return response(req, res, -100, "비밀번호를 입력해 주세요.", {});
            }
            let is_exist_user = await pool.query(`SELECT * FROM users WHERE user_name=? `, [user_name]);
            if (is_exist_user?.result.length > 0) {
                return response(req, res, -100, "유저아이디가 이미 존재합니다.", false)
            }
            let pw_data = await createHashedPassword(user_pw);
            if (!is_manager) {
                if (level > 0) {
                    return lowLevelException(req, res);
                }
            }
            user_pw = pw_data.hashedPassword;
            let user_salt = pw_data.salt;
            let obj = {
                user_name,
                user_pw,
                nickname,
                level,
                phone_num,
                profile_img,
                user_salt
            }
            let result = await insertQuery('users', obj);
            return response(req, res, 100, "success", {})
        } catch (err) {
            return response(req, res, -200, err?.message || "서버 에러 발생", false)
        } finally {

        }
    },
    signOut: async (req, res, next) => {
        try {
            let is_manager = await checkIsManagerUrl(req);
            const decode_user = checkLevel(req.cookies.token, 0);

            res.clearCookie('token');
            return response(req, res, 100, "success", {})
        } catch (err) {
            console.log(err)
            return response(req, res, -200, "서버 에러 발생", false)
        } finally {

        }
    },
    checkSign: async (req, res, next) => {
        try {
            let is_manager = await checkIsManagerUrl(req);
            const decode_user = checkLevel(req.cookies.token, 0);
            if (!decode_user) {
                return lowLevelException(req, res);
            }
            let requestIp = getReqIp(req);
            if (decode_user?.level >= 50) {
                let developer_ip_list = [
                    '183.107.112.147',
                    '59.26.14.23',
                ]
                if (!developer_ip_list.includes(requestIp)) {
                    return response(req, res, -150, "권한이 없습니다.", {})
                }
            }
            return response(req, res, 100, "success", decode_user)
        } catch (err) {
            console.log(err)
            return response(req, res, -200, "서버 에러 발생", false)
        } finally {

        }
    },
    getDeposit: async (req, res, next) => {
        try {
            let is_manager = await checkIsManagerUrl(req);
            const decode_user = checkLevel(req.cookies.token, 0);
            let user_point = await pool.query(`SELECT SUM(deposit) AS deposit FROM deposits WHERE user_id=${decode_user?.id ?? 0}`);
            user_point = user_point?.result[0];
            return response(req, res, 100, "success", user_point)
        } catch (err) {
            console.log(err)
            return response(req, res, -200, "서버 에러 발생", false)
        } finally {

        }
    },
    updateMyInfo: async (req, res, next) => {
        try {
            let is_manager = await checkIsManagerUrl(req);
            const decode_user = checkLevel(req.cookies.token, is_manager ? 1 : 0);
            const {
                nickname, phone_num, profile_img
            } = req.body;
            let files = settingFiles(req.files);
            let obj = {
                nickname, phone_num, profile_img
            };
            obj = { ...obj, ...files };
            let result = await updateQuery(`users`, obj, decode_user?.id);
            await res.clearCookie('token');
            let user = await pool.query(`SELECT * FROM users WHERE id=? `, [decode_user?.id]);
            user = user?.result[0];
            const token = makeUserToken({
                id: user.id,
                user_name: user.user_name,
                nickname: user.nickname,
                level: user.level,
                phone_num: user.phone_num,
                profile_img: user.profile_img,
            })
            await res.cookie("token", token, {
                httpOnly: true,
                maxAge: (60 * 60 * 1000) * 3,
                //sameSite: 'none', 
                //secure: true 
            });
            console.log(123)
            return response(req, res, 100, "success", {})
        } catch (err) {
            console.log(err)
            return response(req, res, -200, "서버 에러 발생", false)
        } finally {

        }
    },
    changePassword: async (req, res, next) => {
        try {
            let is_manager = await checkIsManagerUrl(req);
            const decode_user = checkLevel(req.cookies.token, 0);
            if (!decode_user) {
                return lowLevelException(req, res);
            }
            let id = decode_user?.id;
            let { user_pw } = req.body;

            let user = await selectQuerySimple(table_name, id);
            user = user?.result[0];

            let pw_data = await createHashedPassword(user_pw);
            user_pw = pw_data.hashedPassword;
            let user_salt = pw_data.salt;
            let obj = {
                user_pw, user_salt
            }
            let result = await updateQuery(`${table_name}`, obj, id);
            return response(req, res, 100, "success", {})
        } catch (err) {
            console.log(err)
            return response(req, res, -200, "서버 에러 발생", false)
        } finally {

        }
    },
};

export default authCtrl;