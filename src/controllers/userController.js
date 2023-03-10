import User from "../models/User";
import fetch from "node-fetch";
import bcrypt from "bcrypt";

export const getJoin = (req, res) => res.render("join", { pageTitle: "Join" });
export const postJoin = async (req, res) => {
  // req.body에서 변수 가져옴 (input에 반드시 name명시)
  const { name, username, email, password, password2, location } = req.body;
  const pageTitle = "Join";

  //// 중복 시 에러메세지 ////
  // 아이디 중복 시
  const usernameExists = await User.exists({ username });
  if (usernameExists) {
    return res.render("join", {
      pageTitle, // pageTitle: pageTitle
      errorMessage: "이미 사용 중인 아이디입니다.",
    });
  }

  // 이메일 중복 시
  const emailExists = await User.exists({ email });
  if (emailExists) {
    res.render("join", {
      pageTitle,
      errorMessage: "이미 사용 중인 이메일입니다."
    })
  }

  // USERNAME, EMAIL 중복 제거 > 오류 메세지 하나로 할 경우
  const exists = await User.exists({ $or: [{ username }, { email }] });
  if (exists) {
    return res.status(400).render("join", {
      pageTitle,
      errorMessage: "이미 사용 중 입니다.",
    });
  }
  ////////

  // 비밀번호 확인
  if (password !== password2) {
    return res.status(400).render("join", {
      pageTitle,
      errorMessage: "비밀번호가 일치하지 않습니다.",
    });
  }

  // 유저 생성
  await User.create({
    name, // name: name
    username,
    email,
    password,
    location,
  });

  return res.redirect("/login"); // 계정 생성 후 로그인 페이지로 이동
};

export const getLogin = (req, res) =>
  res.render("login", { pageTitle: "Login" });
export const postLogin = async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username, socialOnly: false });
  const pageTitle = "Login";
  if (!user) {
    return res.status(400).render("login", {
      pageTitle,
      errorMessage: "An account with this username does not exists.",
    });
  }
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) {
    return res
      .status(400)
      .render("login", { pageTitle, errorMessage: "Wrong Password" });
  }
  req.session.loggedIn = true;
  req.session.user = user;
  return res.redirect("/");
};

export const startKakaoLogin = (req, res) => {
  const baseUrl = "https://kauth.kakao.com/oauth/authorize";
  console.log(req.params);
  const config = {
    client_id: process.env.REST_API_KEY,
    redirect_uri: "https://localhost:5000/users/kakao/finish",
    response_type: "code",
  };
  const params = new URLSearchParams(config).toString();
  const finalUrl = `${baseUrl}?${params}`;
  return res.redirect(finalUrl);
};

export const finishKakaoLogin = async (req, res) => {
  const baseUrl = "https://kauth.kakao.com/oauth/token";
  const config = {
    grant_type: "authorization_code",
    client_id: process.env.REST_API_KEY,
    redirect_uri: "https://localhost:5000/users/kakao/finish",
    code: req.query.code,
  };
  const params = new URLSearchParams(config).toString();
  const finalUrl = `${baseUrl}?${params}`;
  const tokenRequest = await (
    await fetch(finalUrl, {
      method: "POST",
    })
  ).json();

  if ("access_token" in tokenRequest) {
    const { access_token } = tokenRequest;
    const apiUrl = "https://kapi.kakao.com/v2/user/me";
    const userData = await (
      await fetch(`${apiUrl}`, {
        headers: { Authorization: `Bearer ${access_token}` },
      })
    ).json();
    console.log(userData);

    const kakaoAccount = userData.kakao_account;
    const kakaoProfile = kakaoAccount.profile;

    if (
      kakaoAccount.is_email_valid === false ||
      kakaoAccount.is_email_verified === false
    ) {
      return res.redirect("/login");
    }
    let user = await User.findOne({ email: kakaoAccount.email });
    if (!user) {
      user = await User.create({
        name: kakaoProfile.nickname,
        socialOnly: true,
        username: kakaoProfile.nickname,
        email: kakaoAccount.email,
        password: "",
        avatarUrl: kakaoProfile.profile_image_url,
        location: "",
      });
    }
    req.session.loggedIn = true;
    req.session.user = user;
    return res.redirect("/");
  } else {
    return res.redirect("/login");
  }
};

export const startGithubLogin = (req, res) => {
  const baseUrl = `https://github.com/login/oauth/authorize`;
  const config = {
    client_id: process.env.GH_CLIENT,
    allow_signup: false,
    scope: "read:user user:email",
  };
  const params = new URLSearchParams(config).toString();
  const finalUrl = `${baseUrl}?${params}`;
  return res.redirect(finalUrl);
};

export const finishGithubLogin = async (req, res) => {
  const baseUrl = "https://github.com/login/oauth/access_token";
  const config = {
    client_id: process.env.GH_CLIENT,
    client_secret: process.env.GH_SECRET,
    code: req.query.code,
  };
  const params = new URLSearchParams(config).toString();
  const finalUrl = `${baseUrl}?${params}`;
  const tokenRequest = await (
    await fetch(finalUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    })
  ).json();
  if ("access_token" in tokenRequest) {
    const { access_token } = tokenRequest;
    const apiUrl = "https://api.github.com";
    const userData = await (
      await fetch(`${apiUrl}/user`, {
        headers: {
          Authorization: `token ${access_token}`,
        },
      })
    ).json();

    const emailData = await (
      await fetch(`${apiUrl}/user/emails`, {
        headers: {
          Authorization: `token ${access_token}`,
        },
      })
    ).json();
    const emailObj = emailData.find(
      (email) => email.primary === true && email.verified === true
    );
    if (!emailObj) {
      // set notification
      return res.redirect("/login");
    }
    let user = await User.findOne({ email: emailObj.email });
    if (!user) {
      user = await User.create({
        avatarUrl: userData.avatar_url,
        name: userData.name,
        username: userData.login,
        email: emailObj.email,
        password: "",
        socialOnly: true,
        location: userData.location,
      });
    }
    req.session.loggedIn = true;
    req.session.user = user;
    return res.redirect("/");
  } else {
    return res.redirect("/login");
  }
};

export const getEdit = (req, res) => {
  return res.render("edit-profile", { pageTitle: "Edit Profile" });
};

export const postEdit = async (req, res) => {
  const {
    session: {
      user: { _id, avatarUrl },
    },
    body: { name, email, username, location },
    file,
  } = req;
  // == const id = req.session.user.id
  // == const { name, email, username, location } = req.body;

  const updateUser = await User.findByIdAndUpdate(
    _id,
    {
      avatarUrl: file ? file.path : avatarUrl, // file이 존재하면 file의 경로를 보내주고 file이 존재하지 않으면 기존 avatarUrl로 저장
      name, //== name:name
      email,
      username,
      location,
    },
    { new: true }
  );

  req.session.user = updateUser;

  return res.redirect("/users/edit");
};

export const logout = (req, res) => {
  req.session.destroy();
  req.flash("info", "Bye Bye");
  return res.redirect("/");
};

export const getChangePassword = (req, res) => {
  if (req.session.user.socialOnly === true) {
    req.flash("error", "Can't change password.");
    return res.redirect("/");
  }
  return res.render("users/change-password", { pageTitle: "Change Password" });
};
export const postChangePassword = async (req, res) => {
  const {
    session: {
      user: { _id },
    },
    body: { oldPassword, newPassword, newPasswordConfirmation },
  } = req;
  const user = await User.findById(_id);

  // bcrypt함수를 사용해 전 해쉬된 비밀번호와 비교
  const ok = await bcrypt.compare(oldPassword, user.password);

  // 현재 비밀번호가 정확하지 않을 때 보내는 오류
  if (!ok) {
    return res.status(400).render("users/change-password", {
      pageTitle: "Change Password",
      errorMessage: "The current password is incorrect",
    });
  }

  // 변경 확인 비밀번호와 변경 비밀번호와 일치하지 않을 때 보내는 오류
  if (newPassword !== newPasswordConfirmation) {
    return res.status(400).render("users/change-password", {
      pageTitle: "Change Password",
      errorMessage: "The password does not match the confirmation",
    });
  }

  // 이전 비밀번호와 변경 비밀번호가 같을 시 보내는 오류
  if (oldPassword === newPassword) {
    return res.status(400).render("users/change-password", {
      pageTitle,
      errorMessage: "The old password equals new password",
    });
  }

  user.password = newPassword;

  // 방법 1
  // await user.save(); // 새로운 비밀번호를 해쉬하기 위해 여기서 User.js에서 비밀번호 해쉬함수가 실행됨
  // return res.redirect("/users/logout"); // 비밀번호 변경시 로그아웃

  // 방법 2 (보안을 위해 좀 더 확실하게 destroy 해주는 방법)
  await user.save();
  req.flash("info", "Password updated");
  req.session.destroy();
  return res.redirect("/login");
};

export const see = async (req, res) => {
  const { id } = req.params;
  const user = await User.findById(id).populate({
    path: "videos",
    populate: {
      path: "owner",
      model: "User",
    },
  });
  if (!user) {
    return res.status(404).render("404", { pageTitle: "User not found" });
  }
  return res.render("users/profile", {
    pageTitle: user.name,
    user,
  });
};
