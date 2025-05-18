import HomePage from "../pages/home/home-page";
import AboutPage from "../pages/about/about-page";
import LoginPage from "../pages/auth/login/login-page";
import Register from "../pages/auth/register/register-page";
import DetailPage from "../pages/details/details-page";
import TambahCerita from "../pages/tambahcerita/tambahcerita-page";

const routeInstances = {
    home: new HomePage(),
    about: new AboutPage(),
    login: new LoginPage(),
    register: new Register(),
    detail: new DetailPage(),
    addStory: new TambahCerita(),
};

const routes = {
    "/": routeInstances.home,
    "/about": routeInstances.about,
    "/login": routeInstances.login,
    "/register": routeInstances.register,
    "/stories/:id": routeInstances.detail,
    "/addstory": routeInstances.addStory,
};

export default routes;
