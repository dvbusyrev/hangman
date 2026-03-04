package Class;
import Interface.*;

public class GameImpl implements Game {
    Man man;
    Judiciary judiciary;
    Hangman hangman;

    public GameImpl() {
        man = new ManImpl();
        judiciary = new JudiciaryImpl();
        hangman = new HangmanImpl();


    }



}
