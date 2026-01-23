import Equipe from './pages/Equipe';
import GestionRoles from './pages/GestionRoles';
import GestionUtilisateurs from './pages/GestionUtilisateurs';
import Historique from './pages/Historique';
import Home from './pages/Home';
import Invite from './pages/Invite';
import Parametres from './pages/Parametres';
import Pertes from './pages/Pertes';
import Recettes from './pages/Recettes';
import Stocks from './pages/Stocks';
import Temperatures from './pages/Temperatures';
import TravailDuJour from './pages/TravailDuJour';
import MiseEnPlace from './pages/MiseEnPlace';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Equipe": Equipe,
    "GestionRoles": GestionRoles,
    "GestionUtilisateurs": GestionUtilisateurs,
    "Historique": Historique,
    "Home": Home,
    "Invite": Invite,
    "Parametres": Parametres,
    "Pertes": Pertes,
    "Recettes": Recettes,
    "Stocks": Stocks,
    "Temperatures": Temperatures,
    "TravailDuJour": TravailDuJour,
    "MiseEnPlace": MiseEnPlace,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};