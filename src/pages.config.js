/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import CoffreFactures from './pages/CoffreFactures';
import Conversation from './pages/Conversation';
import Equipe from './pages/Equipe';
import GestionPostes from './pages/GestionPostes';
import GestionRoles from './pages/GestionRoles';
import GestionUtilisateurs from './pages/GestionUtilisateurs';
import Historique from './pages/Historique';
import Home from './pages/Home';
import Invite from './pages/Invite';
import MiseEnPlace from './pages/MiseEnPlace';
import Parametres from './pages/Parametres';
import Pertes from './pages/Pertes';
import Planning from './pages/Planning';
import Recettes from './pages/Recettes';
import RegistrePersonnel from './pages/RegistrePersonnel';
import Stocks from './pages/Stocks';
import Temperatures from './pages/Temperatures';
import TemplatesRH from './pages/TemplatesRH';
import TravailDuJour from './pages/TravailDuJour';
import AnnoncesUrgentes from './pages/AnnoncesUrgentes';
import AnnouncementDetail from './pages/AnnouncementDetail';
import Presence from './pages/Presence';
import __Layout from './Layout.jsx';


export const PAGES = {
    "CoffreFactures": CoffreFactures,
    "Conversation": Conversation,
    "Equipe": Equipe,
    "GestionPostes": GestionPostes,
    "GestionRoles": GestionRoles,
    "GestionUtilisateurs": GestionUtilisateurs,
    "Historique": Historique,
    "Home": Home,
    "Invite": Invite,
    "MiseEnPlace": MiseEnPlace,
    "Parametres": Parametres,
    "Pertes": Pertes,
    "Planning": Planning,
    "Recettes": Recettes,
    "RegistrePersonnel": RegistrePersonnel,
    "Stocks": Stocks,
    "Temperatures": Temperatures,
    "TemplatesRH": TemplatesRH,
    "TravailDuJour": TravailDuJour,
    "AnnoncesUrgentes": AnnoncesUrgentes,
    "AnnouncementDetail": AnnouncementDetail,
    "Presence": Presence,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};