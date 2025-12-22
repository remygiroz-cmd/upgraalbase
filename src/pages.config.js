import Home from './pages/Home';
import MiseEnPlace from './pages/MiseEnPlace';
import TravailDuJour from './pages/TravailDuJour';
import Temperatures from './pages/Temperatures';
import Recettes from './pages/Recettes';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Home": Home,
    "MiseEnPlace": MiseEnPlace,
    "TravailDuJour": TravailDuJour,
    "Temperatures": Temperatures,
    "Recettes": Recettes,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};