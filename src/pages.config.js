import Home from './pages/Home';
import MiseEnPlace from './pages/MiseEnPlace';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Home": Home,
    "MiseEnPlace": MiseEnPlace,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};